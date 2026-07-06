"""Base class for durable per-campaign spool consumers.

The invariant every subclass must preserve (from docs/architecture.md):

    A message is acked if and only if its event file exists, is complete
    (written + fsync'd), and the builder has been triggered.  An unclean
    shutdown between write and builder trigger means the event is on disk;
    the next builder run corrects the catalog automatically.

Concretely:
    1. claim  — fetch the next batch without committing the broker position
    2. write  — append each event to its campaign JSONL spool file atomically
                (dedup by event_id before writing)
    3. ack    — commit the broker position only after all writes are verified
    4. trigger — signal the builder (no-op stub here; subclasses may override)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from abc import ABC, abstractmethod
from collections.abc import Callable  # noqa: TC003
from dataclasses import dataclass, field
from pathlib import Path  # noqa: TC003
from typing import Any

from ..metadata.hzdr_event import lint_metadata_keys

logger = logging.getLogger(__name__)

# Identity prefix used in the staged-identities set, matching the convention
# from asapo-for-hzdr-damnit/tools/local_message_suite.py.
_EVENT_ID_PREFIX = "event_id:"
_BROKER_ID_PREFIX = "broker_message_id:"
_SHA256_PREFIX = "sha256:"


def _message_identity(message: dict[str, Any]) -> str:
    """Stable dedup key for one event, preferring event_id."""
    event_id = message.get("event_id")
    if event_id:
        return f"{_EVENT_ID_PREFIX}{event_id}"
    broker = message.get("_broker")
    if isinstance(broker, dict) and broker.get("message_id") is not None:
        return f"{_BROKER_ID_PREFIX}{broker['message_id']}"
    return (
        _SHA256_PREFIX
        + hashlib.sha256(
            json.dumps(message, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
    )


def _load_staged_identities(path: Path) -> set[str]:
    """Read all event identities already written to a JSONL spool file."""
    identities: set[str] = set()
    if not path.exists():
        return identities
    with path.open("r", encoding="utf-8") as fh:
        for lineno, raw in enumerate(fh, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                record = json.loads(raw)
            except json.JSONDecodeError as exc:
                logger.warning(
                    "Skipping corrupt JSONL line %s:%d: %s", path, lineno, exc
                )
                continue
            if isinstance(record, dict):
                identities.add(_message_identity(record))
    return identities


def _append_event_durable(path: Path, message: dict[str, Any]) -> None:
    """Append one event to a JSONL spool file and fsync before returning.

    Uses append mode so concurrent readers always see complete lines.
    fsync guarantees the line is on disk before the caller acks the broker.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(message, sort_keys=True) + "\n"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(line)
        fh.flush()
        os.fsync(fh.fileno())


@dataclass
class SpoolConfig:
    """Runtime config for one spool consumer instance."""

    campaign: str
    consumer_group: str
    spool_dir: Path
    poll_interval: float = 2.0
    batch_size: int = 10
    filename: str = "events.jsonl"
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def events_jsonl(self) -> Path:
        """Path to the campaign JSONL spool file consumed by the builder.

        The ASAPO path writes ``events.jsonl``; the Kafka trigger path overrides
        ``filename`` (e.g. ``trigger.jsonl``) so the builder can be pointed at it
        via ``--trigger-jsonl`` independently of the normalized event spool.
        """
        slug = self.campaign.replace(" ", "_") if self.campaign else "default"
        return self.spool_dir / slug / self.filename


class HZDRSpoolConsumer(ABC):
    """Base claim/write/ack/dedup loop for one campaign spool.

    Subclasses implement `_claim` and `_ack`; the loop logic here is shared.
    """

    def __init__(self, config: SpoolConfig) -> None:
        self.config = config
        self._staged: set[str] = set()
        self._loaded = False
        # Optional dispatch hook; set by the lifespan wiring to notify the
        # debounced builder trigger.  Left None (no-op) unless auto-trigger is on.
        self.on_new_events_hook: Callable[[list[Path]], None] | None = None

    def _ensure_loaded(self) -> None:
        if not self._loaded:
            self._staged = _load_staged_identities(self.config.events_jsonl)
            self._loaded = True

    def consume_one(self, message: dict[str, Any]) -> Path | None:
        """Write one message to the spool file if not already present.

        Returns the spool path on write, None if the message was a duplicate.
        Caller must ack the broker only after this returns without raising.
        """
        self._ensure_loaded()
        identity = _message_identity(message)
        if identity in self._staged:
            logger.debug("Dedup skip %s", identity)
            return None
        metadata = message.get("metadata")
        if isinstance(metadata, dict):
            for warning in lint_metadata_keys(metadata):
                logger.warning(
                    "hzdr-event-v1 metadata for event_id=%s: %s",
                    message.get("event_id", identity),
                    warning,
                )
        path = self.config.events_jsonl
        _append_event_durable(path, message)
        self._staged.add(identity)
        logger.info("Spooled %s → %s", identity, path)
        return path

    def on_new_events(self, paths: list[Path]) -> None:
        """Called after a batch is written and acked.

        Dispatches to ``on_new_events_hook`` when one is set (the debounced
        builder trigger); a no-op otherwise.  Subclasses may still override.
        """
        if self.on_new_events_hook is not None:
            self.on_new_events_hook(paths)

    @abstractmethod
    async def _claim(self) -> tuple[list[dict[str, Any]], Any]:
        """Return (messages, ack_token).  Must not advance broker position."""

    @abstractmethod
    async def _ack(self, token: Any) -> None:
        """Commit broker position.  Called only after all writes succeed."""

    async def run(self, stop: asyncio.Event) -> None:
        """Poll loop.  Exits cleanly when stop is set."""
        logger.info(
            "Spool consumer starting campaign=%s group=%s",
            self.config.campaign,
            self.config.consumer_group,
        )
        while not stop.is_set():
            try:
                messages, token = await self._claim()
                if not messages:
                    await asyncio.sleep(self.config.poll_interval)
                    continue
                written: list[Path] = []
                for msg in messages:
                    path = self.consume_one(msg)
                    if path is not None:
                        written.append(path)
                await self._ack(token)
                if written:
                    self.on_new_events(written)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Spool consumer error; retrying after poll interval")
                await asyncio.sleep(self.config.poll_interval)
        logger.info("Spool consumer stopped")
