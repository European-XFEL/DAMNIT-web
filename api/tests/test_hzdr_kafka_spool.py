"""Tests for the durable Kafka trigger spool consumer.

No Docker or live broker: a tiny in-memory ``_FakeKafkaConsumer`` stands in for
``kafka.KafkaConsumer`` and lets us assert the same durability properties the
ASAPO consumer guarantees (see docs/integration-roadmap.md §Durable Spool):

    1. claim does not commit the offset until ack (write-before-commit)
    2. the committed offset is exactly last-consumed + 1
    3. dedup by event_id (redelivery after an uncommitted crash is idempotent)
    4. an empty poll commits nothing (no spurious offset advance)
    5. non-object records are skipped, not spooled
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import TYPE_CHECKING, NamedTuple

import pytest
from kafka import OffsetAndMetadata, TopicPartition

if TYPE_CHECKING:
    from pathlib import Path

from damnit_api.consumer.kafka import KafkaSpoolConsumer
from damnit_api.consumer.spool import SpoolConfig

# ---------------------------------------------------------------------------
# In-memory fake broker
# ---------------------------------------------------------------------------


class _FakeRecord(NamedTuple):
    value: object
    offset: int


class _FakeKafkaConsumer:
    """Single-topic, single-partition in-memory Kafka consumer stand-in."""

    def __init__(self, topic: str = "triggers", partition: int = 0) -> None:
        self.tp = TopicPartition(topic, partition)
        self._log: list[object] = []
        self._delivered = 0
        self.committed: int | None = None
        self.commit_calls: list[dict] = []
        self.closed = False

    def add(self, value: object) -> None:
        self._log.append(value)

    def poll(self, timeout_ms: int, max_records: int | None = None) -> dict:
        start = self._delivered
        end = len(self._log)
        if max_records is not None:
            end = min(end, start + max_records)
        if start >= end:
            return {}
        recs = [_FakeRecord(self._log[i], i) for i in range(start, end)]
        self._delivered = end
        return {self.tp: recs}

    def commit(self, offsets: dict) -> None:
        self.commit_calls.append(offsets)
        self.committed = offsets[self.tp].offset

    def close(self) -> None:
        self.closed = True

    def restart_uncommitted(self) -> None:
        """Rewind delivery to the last committed offset (crash + restart)."""
        self._delivered = self.committed or 0


def _make_event(event_id: str, shot_number: int = 1) -> dict:
    return {
        "schema_version": "hzdr-event-v1",
        "event_id": event_id,
        "experiment_id": "campaign-a",
        "shot_id": f"shot-{shot_number:06d}",
        "shot_number": shot_number,
        "source": "DRACO-Trigger",
        "kind": "trigger",
        "timestamp": "2025-01-15T10:00:00Z",
        "transport": "kafka",
        "trigger_role": "shot",
        "payload_ref": {"topic": "triggers", "partition": 0, "offset": shot_number},
    }


def _make_consumer(
    fake: _FakeKafkaConsumer, spool_dir: Path, campaign: str = "campaign-a"
) -> KafkaSpoolConsumer:
    cfg = SpoolConfig(
        campaign=campaign,
        consumer_group="test-kafka-group",
        spool_dir=spool_dir,
        poll_interval=0.05,
        batch_size=10,
        filename="trigger.jsonl",
    )
    return KafkaSpoolConsumer(config=cfg, consumer=fake, poll_timeout_ms=10)


async def _run_briefly(consumer: KafkaSpoolConsumer, seconds: float = 0.2) -> None:
    stop = asyncio.Event()
    task = asyncio.create_task(consumer.run(stop))
    await asyncio.sleep(seconds)
    stop.set()
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await consumer.aclose()


def _spool_lines(path: Path) -> list[str]:
    if not path.exists():
        return []
    return [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_writes_then_commits_offset(tmp_path: Path) -> None:
    fake = _FakeKafkaConsumer()
    for i in range(1, 4):
        fake.add(_make_event(f"evt-{i}", i))
    consumer = _make_consumer(fake, tmp_path)

    await _run_briefly(consumer)

    assert len(_spool_lines(consumer.config.events_jsonl)) == 3
    assert fake.committed == 3  # last offset (2) + 1
    assert fake.closed is True


@pytest.mark.asyncio
async def test_commit_token_is_last_offset_plus_one(tmp_path: Path) -> None:
    fake = _FakeKafkaConsumer()
    fake.add(_make_event("evt-1", 1))
    fake.add(_make_event("evt-2", 2))
    consumer = _make_consumer(fake, tmp_path)

    messages, token = await consumer._claim()

    assert [m["event_id"] for m in messages] == ["evt-1", "evt-2"]
    assert token == {fake.tp: OffsetAndMetadata(2, None)}


@pytest.mark.asyncio
async def test_empty_poll_commits_nothing(tmp_path: Path) -> None:
    fake = _FakeKafkaConsumer()
    consumer = _make_consumer(fake, tmp_path)

    await _run_briefly(consumer)

    assert fake.commit_calls == []
    assert _spool_lines(consumer.config.events_jsonl) == []


@pytest.mark.asyncio
async def test_dedup_on_uncommitted_replay(tmp_path: Path) -> None:
    fake = _FakeKafkaConsumer()
    fake.add(_make_event("evt-1", 1))
    fake.add(_make_event("evt-2", 2))

    consumer1 = _make_consumer(fake, tmp_path)
    await _run_briefly(consumer1)
    assert len(_spool_lines(consumer1.config.events_jsonl)) == 2

    # Simulate a crash that lost the committed position; the same events are
    # redelivered to a fresh consumer sharing the spool file.
    fake.restart_uncommitted()
    fake._delivered = 0
    consumer2 = _make_consumer(fake, tmp_path)
    await _run_briefly(consumer2)

    # Dedup-by-event_id keeps the spool at two unique lines.
    assert len(_spool_lines(consumer2.config.events_jsonl)) == 2


@pytest.mark.asyncio
async def test_non_object_record_is_skipped(tmp_path: Path) -> None:
    fake = _FakeKafkaConsumer()
    fake.add(_make_event("evt-1", 1))
    fake.add("not-a-dict")
    fake.add(_make_event("evt-2", 2))
    consumer = _make_consumer(fake, tmp_path)

    await _run_briefly(consumer)

    lines = _spool_lines(consumer.config.events_jsonl)
    assert len(lines) == 2
    # The malformed record still advances the offset so it is not redelivered.
    assert fake.committed == 3


@pytest.mark.asyncio
async def test_ack_with_empty_token_is_noop(tmp_path: Path) -> None:
    fake = _FakeKafkaConsumer()
    consumer = _make_consumer(fake, tmp_path)

    await consumer._ack({})

    assert fake.commit_calls == []
