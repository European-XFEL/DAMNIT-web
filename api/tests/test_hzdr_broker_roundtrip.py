"""Real-broker restart/replay integration tests for KafkaSpoolConsumer.

These tests require a live Kafka broker.  Set ``KAFKA_TEST_BROKER`` to the
bootstrap address (default ``localhost:9092``) before running:

    pytest tests/test_hzdr_broker_roundtrip.py -m integration_docker

If the broker is not reachable the tests are *skipped* (not failed), so they
are safe to include in CI pipelines that do not spin up Docker.

Enable in test-all.ps1 with the ``-DockerTests`` flag::

    .\\test-all.ps1 -DockerTests

What is verified here that the in-memory tests (test_hzdr_kafka_spool.py)
cannot:

1. ``test_commit_advances_broker_offset``: the Kafka broker confirms the consumer
   group offset advances to N after ``_ack`` with a real broker.
2. ``test_restart_resumes_from_committed_offset``: after a clean shutdown at
   offset N, a fresh consumer with the same group ID picks up from offset N,
   not from 0.
3. ``test_dedup_blocks_replay_from_fresh_group``: a brand-new consumer group
   (no committed offset, starts from earliest) re-delivers all events, but
   the spool consumer deduplicates them and adds no extra lines.
4. ``test_10_events_no_lost_no_duplicates``: the golden-path scenario —
   10 events, clean run, clean restart — leaves exactly 10 unique spool lines.
"""

from __future__ import annotations

import asyncio
import contextlib
import importlib
import json
import os
import time
import uuid
from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from pathlib import Path

# ---------------------------------------------------------------------------
# Broker availability
# ---------------------------------------------------------------------------

BROKER_ENV = "KAFKA_TEST_BROKER"
_DEFAULT_BROKER = "localhost:9092"


def _broker_address() -> str:
    return os.environ.get(BROKER_ENV, _DEFAULT_BROKER)


def _is_broker_reachable(bootstrap: str, timeout: float = 3.0) -> bool:
    try:
        from kafka import KafkaAdminClient

        admin = KafkaAdminClient(
            bootstrap_servers=bootstrap,
            request_timeout_ms=int(timeout * 1000),
            api_version_auto_timeout_ms=int(timeout * 1000),
        )
        admin.close()
        return True
    except Exception:
        return False


@pytest.fixture(scope="module")
def broker(tmp_path_factory: pytest.TempPathFactory) -> str:
    """Skip the whole module when the broker is not reachable."""
    addr = _broker_address()
    if not _is_broker_reachable(addr):
        pytest.skip(
            f"Kafka broker not reachable at {addr}. "
            f"Set {BROKER_ENV}=<host:port> and start kafka-broker-docker."
        )
    return addr


@pytest.fixture
def unique_topic(broker: str) -> str:
    """Fresh single-partition topic per test (UUID suffix avoids collisions)."""
    from kafka import KafkaAdminClient
    from kafka.admin import NewTopic

    topic = f"hzdr-test-rt-{uuid.uuid4().hex[:10]}"
    admin = KafkaAdminClient(bootstrap_servers=broker)
    try:
        admin.create_topics([
            NewTopic(name=topic, num_partitions=1, replication_factor=1)
        ])
    finally:
        admin.close()
    return topic


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _topic_partition(topic: str, partition: int) -> Any:
    return vars(importlib.import_module("kafka.structs"))["TopicPartition"](
        topic, partition
    )


def _deserialize_value(value: bytes | None) -> Any:
    if value is None:
        return None
    return json.loads(value.decode("utf-8"))


def _produce_events(broker: str, topic: str, count: int, campaign: str) -> list[dict]:
    """Publish ``count`` canonical hzdr-event-v1 envelopes; return the list."""
    from kafka import KafkaProducer

    producer = KafkaProducer(
        bootstrap_servers=broker,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    events = []
    for i in range(count):
        event = {
            "schema_version": "hzdr-event-v1",
            "event_id": f"{campaign}:draco01:{i}",
            "experiment_id": campaign,
            "shot_id": f"shot-{i:06d}",
            "shot_number": i,
            "source": "DRACO-Trigger",
            "kind": "draco.trigger",
            "timestamp": "2025-01-15T10:00:00Z",
            "transport": "kafka",
            "payload_ref": {"topic": topic, "partition": 0, "offset": i},
        }
        producer.send(topic, value=event)
        events.append(event)
    producer.flush()
    producer.close()
    return events


def _make_consumer(
    broker: str,
    topic: str,
    group_id: str,
    spool_dir: Path,
    campaign: str,
    poll_interval: float = 0.05,
    poll_timeout_ms: int = 500,
) -> Any:
    from kafka import KafkaConsumer

    from damnit_api.consumer.kafka import KafkaSpoolConsumer
    from damnit_api.consumer.spool import SpoolConfig

    raw_consumer = KafkaConsumer(
        topic,
        bootstrap_servers=broker,
        group_id=group_id,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
        value_deserializer=_deserialize_value,
        consumer_timeout_ms=poll_timeout_ms,
    )
    cfg = SpoolConfig(
        campaign=campaign,
        consumer_group=group_id,
        spool_dir=spool_dir,
        poll_interval=poll_interval,
        batch_size=20,
        filename="trigger.jsonl",
    )
    return KafkaSpoolConsumer(
        config=cfg, consumer=raw_consumer, poll_timeout_ms=poll_timeout_ms
    )


def _committed_offset(
    broker: str, group_id: str, topic: str, partition: int = 0
) -> int | None:
    """Return the committed offset for the group, or None if none committed yet."""
    from kafka import KafkaAdminClient

    admin = KafkaAdminClient(bootstrap_servers=broker)
    try:
        offsets = admin.list_consumer_group_offsets(group_id)
        result = offsets.get(_topic_partition(topic, partition))
        return result.offset if result is not None else None
    except Exception:
        return None
    finally:
        admin.close()


async def _run_until_drained(
    consumer: Any, max_seconds: float = 6.0, min_seconds: float = 1.0
) -> None:
    """Run the consumer until the spool stabilises or timeout.

    Waits at least ``min_seconds`` before checking the spool, to avoid stopping
    immediately when the spool file already exists from a prior run.
    """
    stop = asyncio.Event()
    task = asyncio.create_task(consumer.run(stop))
    deadline = time.monotonic() + max_seconds
    start_time = time.monotonic()
    prev_size = -1
    while time.monotonic() < deadline:
        await asyncio.sleep(0.2)
        # Don't check stability until min_seconds have elapsed
        if time.monotonic() - start_time < min_seconds:
            continue
        spool = consumer.config.events_jsonl
        if spool.exists():
            size = spool.stat().st_size
            if size > 0 and size == prev_size:
                await asyncio.sleep(0.3)  # one more grace period
                break
            prev_size = size
    stop.set()
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await consumer.aclose()


def _spool_events(spool: Path) -> list[dict]:
    if not spool.exists():
        return []
    return [
        json.loads(ln)
        for ln in spool.read_text(encoding="utf-8").splitlines()
        if ln.strip()
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.integration_docker
@pytest.mark.asyncio
async def test_commit_advances_broker_offset(
    broker: str, unique_topic: str, tmp_path: Path
) -> None:
    """Broker-committed offset advances to N after _ack is called with N messages."""
    campaign = "rt-test-commit"
    _produce_events(broker, unique_topic, count=3, campaign=campaign)
    await asyncio.sleep(0.3)

    group_id = f"test-commit-{uuid.uuid4().hex[:8]}"
    consumer = _make_consumer(broker, unique_topic, group_id, tmp_path, campaign)

    # Before any claim: no committed offset.
    assert _committed_offset(broker, group_id, unique_topic) is None

    # Claim → write → ack.
    messages, token = await consumer._claim()
    assert len(messages) == 3
    # Still not committed (write not done yet in this manual-call path).
    # We call consume_one manually to exercise the write side too.
    for msg in messages:
        consumer.consume_one(msg)
    await consumer._ack(token)
    await consumer.aclose()

    # After ack: offset committed to 3 (last offset + 1).
    committed = _committed_offset(broker, group_id, unique_topic)
    assert committed == 3, f"Expected committed offset 3, got {committed}"


@pytest.mark.integration_docker
@pytest.mark.asyncio
async def test_restart_resumes_from_committed_offset(
    broker: str, unique_topic: str, tmp_path: Path
) -> None:
    """A fresh consumer with the same group ID picks up from the committed offset."""
    campaign = "rt-test-resume"
    events = _produce_events(broker, unique_topic, count=10, campaign=campaign)
    await asyncio.sleep(0.3)

    group_id = f"test-resume-{uuid.uuid4().hex[:8]}"

    # First run: consume all 10 events.
    spool_dir1 = tmp_path / "run1"
    c1 = _make_consumer(broker, unique_topic, group_id, spool_dir1, campaign)
    await _run_until_drained(c1)
    spooled1 = _spool_events(c1.config.events_jsonl)
    assert len(spooled1) == 10, f"First run: expected 10 events, got {len(spooled1)}"

    committed = _committed_offset(broker, group_id, unique_topic)
    assert committed == 10, f"Expected committed offset 10, got {committed}"

    # Second run with the same group ID: no new events (all committed).
    spool_dir2 = tmp_path / "run2"
    c2 = _make_consumer(broker, unique_topic, group_id, spool_dir2, campaign)
    stop = asyncio.Event()
    task = asyncio.create_task(c2.run(stop))
    await asyncio.sleep(2.0)
    stop.set()
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await c2.aclose()

    spooled2 = _spool_events(c2.config.events_jsonl)
    assert len(spooled2) == 0, (
        f"Second run with same group should receive no new events, got {len(spooled2)}"
    )
    # Offset must remain 10.
    assert _committed_offset(broker, group_id, unique_topic) == 10

    _ = events  # referenced to satisfy "unused" linters


@pytest.mark.integration_docker
@pytest.mark.asyncio
async def test_dedup_blocks_replay_from_fresh_group(
    broker: str, unique_topic: str, tmp_path: Path
) -> None:
    """A brand-new consumer group starts from offset 0 and re-delivers all events.

    The spool consumer must dedup by event_id and add NO new lines when the
    spool file already contains those events from a prior run.
    """
    campaign = "rt-test-dedup"
    _produce_events(broker, unique_topic, count=5, campaign=campaign)
    await asyncio.sleep(0.3)

    spool_dir = tmp_path / "dedup"

    # First run with group A: consume and commit.
    group_a = f"test-dedup-a-{uuid.uuid4().hex[:8]}"
    c1 = _make_consumer(broker, unique_topic, group_a, spool_dir, campaign)
    await _run_until_drained(c1)
    spooled_first = _spool_events(c1.config.events_jsonl)
    assert len(spooled_first) == 5

    # Second run with group B (no committed offset → starts from 0, same spool dir).
    # The consumer loads the existing staged identities from disk and deduplicates.
    group_b = f"test-dedup-b-{uuid.uuid4().hex[:8]}"
    c2 = _make_consumer(broker, unique_topic, group_b, spool_dir, campaign)
    # min_seconds=2 so the consumer has time to poll and process before we check
    await _run_until_drained(c2, min_seconds=2.0)

    spooled_second = _spool_events(c2.config.events_jsonl)
    assert len(spooled_second) == 5, (
        f"After replay via fresh group, dedup must keep spool at 5 lines; "
        f"got {len(spooled_second)}"
    )
    event_ids = [e["event_id"] for e in spooled_second]
    assert len(set(event_ids)) == 5, f"Duplicate event_ids found: {event_ids}"


@pytest.mark.integration_docker
@pytest.mark.asyncio
async def test_10_events_no_lost_no_duplicates(
    broker: str, unique_topic: str, tmp_path: Path
) -> None:
    """Golden path: 10 events, one clean run → exactly 10 unique spool lines."""
    campaign = "rt-test-golden"
    expected = _produce_events(broker, unique_topic, count=10, campaign=campaign)
    await asyncio.sleep(0.3)

    group_id = f"test-golden-{uuid.uuid4().hex[:8]}"
    spool_dir = tmp_path / "golden"

    consumer = _make_consumer(broker, unique_topic, group_id, spool_dir, campaign)
    await _run_until_drained(consumer, max_seconds=10.0)

    spooled = _spool_events(consumer.config.events_jsonl)
    assert len(spooled) == 10, f"Expected 10 events, got {len(spooled)}"

    spooled_ids = {e["event_id"] for e in spooled}
    expected_ids = {e["event_id"] for e in expected}
    assert spooled_ids == expected_ids, (
        f"Spool IDs mismatch.\nMissing: {expected_ids - spooled_ids}\n"
        f"Extra:   {spooled_ids - expected_ids}"
    )
    assert _committed_offset(broker, group_id, unique_topic) == 10
