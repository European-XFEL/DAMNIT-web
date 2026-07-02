"""Real flow activity for the HZDR flow monitor's Live mode.

``GET /config/health`` answers "can the API reach the brokers?".  This module
answers the next question — "is data actually flowing?" — by reading, read-only:

* **Kafka (producer side):** per-topic message count (``end - beginning``
  offsets) and the timestamp of the newest record.  No consumer group is joined
  and no offset is committed, so this is safe to poll while the real spool
  consumer is disabled — it lights up the moment a producer publishes.
* **Spool (DAMNIT ingest side):** per-campaign JSONL spool files the consumers
  write — event line count, file mtime, and the newest event ``timestamp``.
* **ASAPO (producer side, optional):** stream sizes via the optional
  ``asapo_consumer`` client.  Absent the client or its config, this degrades to
  ``available=False`` with a reason and never raises.

Every gatherer is defensive: a broker that is down or a missing client yields an
``available=False`` block with a short ``detail``, never an exception, so the
endpoint always returns a full picture.
"""

from __future__ import annotations

import contextlib
import importlib
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Response models
# --------------------------------------------------------------------------- #
class KafkaTopicActivity(BaseModel):
    topic: str
    exists: bool
    messages: int = 0
    partitions: int = 0
    last_message_at: str | None = None


class KafkaActivity(BaseModel):
    available: bool
    detail: str | None = None
    topics: list[KafkaTopicActivity] = []


class AsapoStreamActivity(BaseModel):
    name: str
    messages: int = 0
    last_message_at: str | None = None


class AsapoActivity(BaseModel):
    available: bool
    detail: str | None = None
    streams: list[AsapoStreamActivity] = []


class SpoolFileActivity(BaseModel):
    label: str
    campaign: str
    events: int = 0
    modified_at: str | None = None
    last_event_at: str | None = None


class SpoolActivity(BaseModel):
    files: list[SpoolFileActivity] = []


class FlowActivity(BaseModel):
    kafka: KafkaActivity
    spool: SpoolActivity
    asapo: AsapoActivity


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _iso_utc_from_ms(epoch_ms: int) -> str:
    return datetime.fromtimestamp(epoch_ms / 1000, tz=UTC).isoformat()


def _iso_utc_from_seconds(epoch_s: float) -> str:
    return datetime.fromtimestamp(epoch_s, tz=UTC).isoformat()


def _topic_partition(topic: str, partition: int) -> Any:
    """Return kafka-python-ng's TopicPartition despite incomplete static exports."""
    return vars(importlib.import_module("kafka.structs"))["TopicPartition"](
        topic, partition
    )


# --------------------------------------------------------------------------- #
# Kafka (broker / producer side) — read-only offset inspection
# --------------------------------------------------------------------------- #
def _kafka_last_timestamp(
    consumer: Any, partitions: list[Any], end: dict[Any, int]
) -> str | None:
    """Best-effort newest-record timestamp across a topic's partitions.

    Seeks each non-empty partition to its last offset and reads one record.
    Any failure on a partition is skipped, not raised — the count is the
    primary signal and the timestamp is a bonus.
    """
    latest_ms: int | None = None
    for tp in partitions:
        if end.get(tp, 0) <= 0:
            continue
        try:
            consumer.assign([tp])
            consumer.seek(tp, end[tp] - 1)
            batch = consumer.poll(timeout_ms=500, max_records=1)
            for records in batch.values():
                for record in records:
                    ts = getattr(record, "timestamp", None)
                    if ts and (latest_ms is None or ts > latest_ms):
                        latest_ms = ts
        except Exception:  # noqa: S112 - one bad partition must not fail the probe
            continue
    return _iso_utc_from_ms(latest_ms) if latest_ms is not None else None


def gather_kafka_activity(
    bootstrap_servers: str | list[str],
    topics: list[str],
    *,
    timeout: float = 3.0,
    consumer_factory: Any | None = None,
) -> KafkaActivity:
    """Per-topic message counts + newest-record time, without joining a group.

    ``consumer_factory`` is injectable for tests; in production a read-only
    ``KafkaConsumer`` (no ``group_id``) is created lazily so importing this
    module never opens a socket.
    """
    if not topics:
        return KafkaActivity(available=False, detail="no topics configured")

    if consumer_factory is None:
        try:
            from kafka import KafkaConsumer
        except ImportError:
            return KafkaActivity(available=False, detail="kafka client not installed")

        timeout_ms = int(timeout * 1000)

        def _default_consumer_factory() -> Any:
            return KafkaConsumer(
                bootstrap_servers=bootstrap_servers,
                enable_auto_commit=False,
                consumer_timeout_ms=timeout_ms,
                request_timeout_ms=max(timeout_ms, 1000) + 1000,
            )

        consumer_factory = _default_consumer_factory

    consumer = None
    try:
        consumer = consumer_factory()
        results: list[KafkaTopicActivity] = []
        for topic in topics:
            parts = consumer.partitions_for_topic(topic)
            if not parts:
                results.append(KafkaTopicActivity(topic=topic, exists=False))
                continue
            tps = [_topic_partition(topic, p) for p in parts]
            beginning = consumer.beginning_offsets(tps)
            end = consumer.end_offsets(tps)
            messages = sum(end[tp] - beginning[tp] for tp in tps)
            results.append(
                KafkaTopicActivity(
                    topic=topic,
                    exists=True,
                    messages=messages,
                    partitions=len(tps),
                    last_message_at=_kafka_last_timestamp(consumer, tps, end),
                )
            )
        return KafkaActivity(available=True, topics=results)
    except Exception as exc:
        return KafkaActivity(available=False, detail=str(exc)[:160])
    finally:
        if consumer is not None:
            with contextlib.suppress(Exception):
                consumer.close()


# --------------------------------------------------------------------------- #
# Spool (DAMNIT ingest side) — filesystem
# --------------------------------------------------------------------------- #
def _jsonl_stats(path: Path) -> tuple[int, str | None]:
    """Count JSONL events and return the newest event ``timestamp`` field.

    Blank lines are ignored; a corrupt last line does not abort the count.
    """
    count = 0
    last_timestamp: str | None = None
    try:
        with path.open("r", encoding="utf-8") as fh:
            for raw in fh:
                raw = raw.strip()
                if not raw:
                    continue
                count += 1
                try:
                    record = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    ts = record.get("timestamp")
                    if isinstance(ts, str):
                        last_timestamp = ts
    except OSError as exc:
        logger.warning("Could not read spool file %s: %s", path, exc)
    return count, last_timestamp


def gather_spool_activity(
    spool_root: Path,
    specs: list[tuple[str, Path, str]],
) -> SpoolActivity:
    """Inspect each ``<spool_dir>/<campaign>/<filename>`` JSONL spool file.

    ``specs`` is a list of ``(label, spool_dir, filename)``; ``spool_dir`` may be
    relative to ``spool_root`` (matching the lifespan's resolution).
    """
    files: list[SpoolFileActivity] = []
    for label, spool_dir, filename in specs:
        root = spool_dir if spool_dir.is_absolute() else spool_root / spool_dir
        if not root.exists():
            continue
        for path in sorted(root.glob(f"*/{filename}")):
            if not path.is_file():
                continue
            events, last_event_at = _jsonl_stats(path)
            files.append(
                SpoolFileActivity(
                    label=label,
                    campaign=path.parent.name,
                    events=events,
                    modified_at=_iso_utc_from_seconds(path.stat().st_mtime),
                    last_event_at=last_event_at,
                )
            )
    return SpoolActivity(files=files)


# --------------------------------------------------------------------------- #
# ASAPO (broker / producer side) — optional client
# --------------------------------------------------------------------------- #
def gather_asapo_activity(
    *,
    configured: bool,
    endpoint: str = "",
    beamtime: str = "",
    data_source: str = "",
    token: str = "",
    source_path: str = "",
    has_filesystem: bool = False,
    timeout_ms: int = 3000,
) -> AsapoActivity:
    """Stream sizes from the optional ``asapo_consumer`` client.

    Degrades to ``available=False`` (with a reason) when the client is not
    installed or the ASAPO activity settings are incomplete.  Never raises.
    """
    if not configured:
        return AsapoActivity(
            available=False,
            detail="ASAPO activity not configured (set DW_API_HZDR_ASAPO_ACTIVITY__*)",
        )
    try:
        import asapo_consumer  # type: ignore[import-not-found]
    except ImportError:
        return AsapoActivity(
            available=False,
            detail="asapo_consumer not installed (uv sync --extra asapo)",
        )
    try:
        consumer = asapo_consumer.create_consumer(
            endpoint,
            source_path,
            has_filesystem,
            beamtime,
            data_source,
            token,
            timeout_ms,
        )
        streams = consumer.get_stream_list()
        results: list[AsapoStreamActivity] = []
        for stream in streams:
            name = stream.get("name") if isinstance(stream, dict) else str(stream)
            if not name:
                continue
            try:
                size = consumer.get_current_size(stream=name)
            except Exception:
                size = 0
            results.append(AsapoStreamActivity(name=name, messages=int(size)))
        return AsapoActivity(available=True, streams=results)
    except Exception as exc:
        return AsapoActivity(available=False, detail=str(exc)[:160])


# --------------------------------------------------------------------------- #
# Orchestrator — reads settings, safe to run in a worker thread
# --------------------------------------------------------------------------- #
def collect_flow_activity() -> FlowActivity:
    """Gather Kafka + spool + ASAPO activity from the current settings.

    Synchronous and blocking (Kafka/ASAPO do network I/O); call via
    ``asyncio.to_thread`` from the async route.
    """
    from .settings import settings

    kafka = gather_kafka_activity(
        settings.hzdr_kafka_spool.bootstrap_servers,
        settings.hzdr_kafka_spool.topics,
        timeout=settings.hzdr_health.timeout,
    )

    spool_root = settings.damnit_path or Path.cwd()
    specs = [
        ("ASAPO events", settings.hzdr_spool.spool_dir, "events.jsonl"),
        (
            "Kafka triggers",
            settings.hzdr_kafka_spool.spool_dir,
            settings.hzdr_kafka_spool.filename,
        ),
    ]
    spool = gather_spool_activity(spool_root, specs)

    activity = settings.hzdr_asapo_activity
    asapo = gather_asapo_activity(
        configured=activity.configured,
        endpoint=activity.endpoint,
        beamtime=activity.beamtime,
        data_source=activity.data_source,
        token=activity.token.get_secret_value(),
        source_path=activity.source_path,
        has_filesystem=activity.has_filesystem,
        timeout_ms=activity.timeout_ms,
    )

    return FlowActivity(kafka=kafka, spool=spool, asapo=asapo)
