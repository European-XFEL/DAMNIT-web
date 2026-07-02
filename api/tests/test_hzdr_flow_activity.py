"""Tests for real flow-activity gathering (GET /config/flow-activity).

No live broker: a tiny in-memory ``_FakeKafkaConsumer`` exposes the read-only
offset API the gatherer relies on, and spool activity is pure filesystem.  These
cover the behaviours that matter when feeders come online:

    1. Kafka message count = end - beginning offsets, summed over partitions
    2. newest-record timestamp is surfaced (best-effort)
    3. an unknown topic reports exists=False, not an error
    4. a broker that raises degrades to available=False, never propagates
    5. spool files report event counts + newest event timestamp
    6. ASAPO degrades cleanly when unconfigured / client missing
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, NamedTuple

from damnit_api.shared.flow_activity import (
    gather_asapo_activity,
    gather_kafka_activity,
    gather_spool_activity,
)

if TYPE_CHECKING:
    from pathlib import Path


# ---------------------------------------------------------------------------
# In-memory fake Kafka consumer (offset-inspection subset only)
# ---------------------------------------------------------------------------
class _FakeRecord(NamedTuple):
    timestamp: int


class _FakeKafkaConsumer:
    def __init__(self, topics: dict[str, dict[int, tuple[int, int, int]]]) -> None:
        # topic -> {partition: (beginning, end, last_ts_ms)}
        self._topics = topics
        self.closed = False

    def partitions_for_topic(self, topic: str) -> set[int] | None:
        parts = self._topics.get(topic)
        return set(parts) if parts else None

    def beginning_offsets(self, tps: list[Any]) -> dict[Any, int]:
        return {tp: self._topics[tp.topic][tp.partition][0] for tp in tps}

    def end_offsets(self, tps: list[Any]) -> dict[Any, int]:
        return {tp: self._topics[tp.topic][tp.partition][1] for tp in tps}

    def assign(self, tps: list[Any]) -> None:
        self._assigned = tps

    def seek(self, tp: Any, offset: int) -> None:
        self._seek = (tp, offset)

    def poll(self, timeout_ms: int, max_records: int | None = None) -> dict:
        tp, _ = self._seek
        ts = self._topics[tp.topic][tp.partition][2]
        return {tp: [_FakeRecord(timestamp=ts)]}

    def close(self) -> None:
        self.closed = True


def test_kafka_activity_counts_and_timestamp() -> None:
    # two partitions: (begin, end, last_ts) -> 90 + 5 = 95 messages
    fake = _FakeKafkaConsumer({
        "processed-message": {
            0: (10, 100, 1_700_000_000_000),
            1: (0, 5, 1_700_000_500_000),
        }
    })
    activity = gather_kafka_activity(
        "broker:9092", ["processed-message"], consumer_factory=lambda: fake
    )
    assert activity.available is True
    assert len(activity.topics) == 1
    topic = activity.topics[0]
    assert topic.exists is True
    assert topic.messages == 95
    assert topic.partitions == 2
    # newest timestamp across partitions (the later one), as UTC ISO
    assert topic.last_message_at is not None
    assert topic.last_message_at.startswith("2023-")
    assert fake.closed is True


def test_kafka_activity_unknown_topic() -> None:
    fake = _FakeKafkaConsumer({})
    activity = gather_kafka_activity(
        "broker:9092", ["nope"], consumer_factory=lambda: fake
    )
    assert activity.available is True
    assert activity.topics[0].exists is False
    assert activity.topics[0].messages == 0


def test_kafka_activity_no_topics_configured() -> None:
    activity = gather_kafka_activity("broker:9092", [])
    assert activity.available is False
    assert "no topics" in (activity.detail or "")


def test_kafka_activity_broker_down_degrades() -> None:
    def boom() -> object:
        msg = "connection refused"
        raise OSError(msg)

    activity = gather_kafka_activity(
        "broker:9092", ["processed-message"], consumer_factory=boom
    )
    assert activity.available is False
    assert "connection refused" in (activity.detail or "")


def test_spool_activity_counts_events_and_last_timestamp(tmp_path: Path) -> None:
    campaign_dir = tmp_path / "asapo" / "campaign-A"
    campaign_dir.mkdir(parents=True)
    spool_file = campaign_dir / "events.jsonl"
    spool_file.write_text(
        '{"event_id": "a", "timestamp": "2026-01-01T00:00:00Z"}\n'
        "\n"  # blank line ignored
        '{"event_id": "b", "timestamp": "2026-01-02T00:00:00Z"}\n',
        encoding="utf-8",
    )

    activity = gather_spool_activity(
        tmp_path, [("ASAPO events", tmp_path / "asapo", "events.jsonl")]
    )
    assert len(activity.files) == 1
    entry = activity.files[0]
    assert entry.campaign == "campaign-A"
    assert entry.events == 2
    assert entry.last_event_at == "2026-01-02T00:00:00Z"
    assert entry.modified_at is not None


def test_spool_activity_missing_dir_is_empty(tmp_path: Path) -> None:
    activity = gather_spool_activity(
        tmp_path, [("Kafka triggers", tmp_path / "kafka", "trigger.jsonl")]
    )
    assert activity.files == []


def test_asapo_activity_unconfigured_degrades() -> None:
    activity = gather_asapo_activity(configured=False)
    assert activity.available is False
    assert "not configured" in (activity.detail or "")
    assert activity.streams == []
