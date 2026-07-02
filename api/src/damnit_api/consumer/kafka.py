"""Kafka spool consumer for DAQ File Watchdog / shotcounter trigger events.

Same durable claim → write-fsync → ack → dedup loop as the ASAPO consumer
(see :mod:`.spool`), but the broker is a Kafka consumer group instead of the
harness HTTP API.  The key difference is offset handling:

    * ``enable_auto_commit=False`` — the broker position never advances on its
      own.  ``_claim`` polls a batch *without* committing; ``_ack`` commits the
      consumed offsets only after every message in the batch has been written
      and fsync'd to the campaign spool file.

This preserves the architecture invariant: an offset is committed if and only
if its event is durably on disk.  An unclean shutdown between write and commit
re-delivers the event on restart, and dedup-by-``event_id`` makes that replay
idempotent.

``kafka-python-ng`` is synchronous, so the blocking ``poll``/``commit`` calls
are off-loaded with :func:`asyncio.to_thread` to keep the FastAPI event loop
responsive.  The real Kafka consumer is created lazily (so importing this
module never opens a socket) and can be injected for tests.
"""

from __future__ import annotations

import asyncio
import importlib
import json
import logging
from pathlib import Path  # noqa: TC003
from typing import Any, Protocol

from .spool import HZDRSpoolConsumer, SpoolConfig

logger = logging.getLogger(__name__)


class _KafkaConsumerLike(Protocol):
    """The subset of ``kafka.KafkaConsumer`` this spool consumer relies on."""

    def poll(
        self, timeout_ms: int, max_records: int | None = ...
    ) -> dict[Any, list[Any]]: ...

    def commit(self, offsets: dict[Any, Any]) -> None: ...

    def close(self) -> None: ...


def _build_kafka_consumer(
    bootstrap_servers: str | list[str],
    topics: list[str],
    group_id: str,
) -> _KafkaConsumerLike:
    """Construct a real ``KafkaConsumer`` with manual-commit semantics."""
    from kafka import KafkaConsumer

    def _deserialize_value(value: bytes | None) -> Any:
        if value is None:
            return None
        return json.loads(value.decode("utf-8"))

    return KafkaConsumer(
        *topics,
        bootstrap_servers=bootstrap_servers,
        group_id=group_id,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
        value_deserializer=_deserialize_value,
    )


def _offset_and_metadata(offset: int) -> Any:
    """Return kafka-python-ng's commit token without relying on incomplete stubs."""
    return vars(importlib.import_module("kafka.structs"))["OffsetAndMetadata"](
        offset, None
    )


class KafkaSpoolConsumer(HZDRSpoolConsumer):
    """Durable Kafka consumer that spools ``hzdr-event-v1`` trigger envelopes.

    Pass a ready ``consumer`` (real or fake) for full control, or use
    :meth:`from_settings` to build one from ``DW_API_HZDR_KAFKA_SPOOL__*``.
    """

    def __init__(
        self,
        config: SpoolConfig,
        consumer: _KafkaConsumerLike,
        poll_timeout_ms: int = 1000,
    ) -> None:
        super().__init__(config)
        self._consumer = consumer
        self._poll_timeout_ms = poll_timeout_ms

    async def aclose(self) -> None:
        await asyncio.to_thread(self._consumer.close)

    def _poll(self) -> tuple[list[dict[str, Any]], dict[Any, Any]]:
        """Blocking poll of one batch; build the per-partition commit token.

        Runs on a worker thread.  The token maps each touched ``TopicPartition``
        to ``OffsetAndMetadata(last_offset + 1)`` — the position to commit only
        after the batch is durably spooled.
        """
        records = self._consumer.poll(
            timeout_ms=self._poll_timeout_ms,
            max_records=self.config.batch_size,
        )
        messages: list[dict[str, Any]] = []
        offsets: dict[Any, Any] = {}
        for tp, recs in records.items():
            for record in recs:
                value = record.value
                if not isinstance(value, dict):
                    logger.warning(
                        "Skipping non-object Kafka record at %s:%s offset %s",
                        getattr(tp, "topic", "?"),
                        getattr(tp, "partition", "?"),
                        record.offset,
                    )
                    continue
                messages.append(value)
                offsets[tp] = _offset_and_metadata(record.offset + 1)
        return messages, offsets

    async def _claim(self) -> tuple[list[dict[str, Any]], Any]:
        return await asyncio.to_thread(self._poll)

    async def _ack(self, token: Any) -> None:
        if not token:
            return
        await asyncio.to_thread(self._consumer.commit, token)

    @classmethod
    def from_settings(cls, spool_root: Path) -> KafkaSpoolConsumer:
        """Build from the ``DW_API_HZDR_KAFKA_SPOOL__*`` settings block."""
        from ..shared.settings import settings

        cfg_settings = settings.hzdr_kafka_spool
        raw_dir = cfg_settings.spool_dir
        spool_dir = raw_dir if raw_dir.is_absolute() else spool_root / raw_dir
        cfg = SpoolConfig(
            campaign=cfg_settings.campaign,
            consumer_group=cfg_settings.consumer_group,
            spool_dir=spool_dir,
            poll_interval=cfg_settings.poll_interval,
            batch_size=cfg_settings.batch_size,
            filename=cfg_settings.filename,
        )
        consumer = _build_kafka_consumer(
            bootstrap_servers=cfg_settings.bootstrap_servers,
            topics=cfg_settings.topics,
            group_id=cfg_settings.consumer_group,
        )
        return cls(
            config=cfg,
            consumer=consumer,
            poll_timeout_ms=cfg_settings.poll_timeout_ms,
        )
