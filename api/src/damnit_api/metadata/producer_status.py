"""Derive DAQ File Watchdog and Shotcounter status from catalog events.

Both views are derived purely from the events already loaded on an
``HZDRSource`` (each shot's ``events`` plus the source's ``review_events``) - no
new I/O, no broker, no database.  There is no dedicated "host" field on the
``hzdr-event-v1`` envelope today, so the watchdog host is taken from the best
available traceability field on each event (payload_ref endpoint/topic/path,
then ``metadata.watch_name``); the model documents that derivation rather than
implying a real hostname exists.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from .hzdr_sources import HZDRReviewEvent, HZDRSource, HZDRSourceEvent

if TYPE_CHECKING:
    from collections.abc import Iterable

# A shotcounter TANGO TKEY, e.g. "draco01". Used to recognise which Shotcounter
# channels actually reported, and to decide active vs. idle.
_TKEY_PATTERN = re.compile(r"draco\d+", re.IGNORECASE)

AnyEvent = HZDRSourceEvent | HZDRReviewEvent


class WatchdogHost(BaseModel):
    """One computer/source the DAQ File Watchdog was seen reporting from.

    ``host`` is a best-effort label derived from event traceability fields, not
    a guaranteed hostname - see the module docstring.
    """

    host: str
    watcher: str | None = None
    transport: str | None = None
    last_seen: str | None = None
    event_count: int = 0


class ShotcounterStatus(BaseModel):
    """Shotcounter liveness derived from shotcounter-like events.

    ``status`` is ``absent`` when no shotcounter events were found, ``active``
    when at least one carries a recognised TKEY (draco01 ...), and ``idle`` when
    shotcounter events exist but none name a TKEY (a degraded/unknown channel).
    """

    status: str = "absent"
    last_event_at: str | None = None
    tkeys_seen: list[str] = Field(default_factory=list)
    event_count: int = 0


class HZDRProducerStatus(BaseModel):
    """DAQ File Watchdog + Shotcounter status for one HZDR source."""

    source_key: str
    watchdog_hosts: list[WatchdogHost] = Field(default_factory=list)
    shotcounter: ShotcounterStatus = Field(default_factory=ShotcounterStatus)


def _iter_events(source: HZDRSource) -> Iterable[AnyEvent]:
    for shot in source.shots:
        yield from shot.events
    yield from source.review_events


def _payload_field(event: AnyEvent, *names: str) -> str | None:
    """Return the first set payload_ref field among names (incl. extras)."""
    payload = event.payload_ref.model_dump()
    for name in names:
        value = payload.get(name)
        if value not in (None, ""):
            return str(value)
    return None


def _metadata_field(event: AnyEvent, *names: str) -> str | None:
    metadata: dict[str, Any] = event.metadata or {}
    for name in names:
        value = metadata.get(name)
        if value not in (None, ""):
            return str(value)
    return None


def _is_watchdog(event: AnyEvent) -> bool:
    return "watchdog" in (event.source or "").lower()


def _is_shotcounter(event: AnyEvent) -> bool:
    haystack = f"{event.source or ''} {event.kind or ''}".lower()
    if "shotcounter" in haystack:
        return True
    return bool(_TKEY_PATTERN.search(haystack))


def _watchdog_host(event: AnyEvent) -> str:
    return (
        _payload_field(event, "endpoint", "host", "hostname", "topic", "path", "uri")
        or _metadata_field(event, "watch_name", "host", "hostname", "computer")
        or event.source
        or "unknown"
    )


def _watchdog_watcher(event: AnyEvent) -> str | None:
    return _metadata_field(event, "watch_name", "watcher", "rule") or event.kind


def derive_watchdog_hosts(source: HZDRSource) -> list[WatchdogHost]:
    """Group DAQ File Watchdog events by derived host computer."""
    hosts: dict[str, WatchdogHost] = {}
    for event in _iter_events(source):
        if not _is_watchdog(event):
            continue
        host = _watchdog_host(event)
        existing = hosts.get(host)
        if existing is None:
            hosts[host] = WatchdogHost(
                host=host,
                watcher=_watchdog_watcher(event),
                transport=event.transport,
                last_seen=event.timestamp,
                event_count=1,
            )
            continue
        existing.event_count += 1
        if event.timestamp and (
            existing.last_seen is None or event.timestamp > existing.last_seen
        ):
            existing.last_seen = event.timestamp
    return sorted(hosts.values(), key=lambda item: item.host)


def derive_shotcounter_status(source: HZDRSource) -> ShotcounterStatus:
    """Summarise Shotcounter liveness from shotcounter-like events."""
    tkeys: set[str] = set()
    last_event_at: str | None = None
    count = 0
    for event in _iter_events(source):
        if not _is_shotcounter(event):
            continue
        count += 1
        tkey = _metadata_field(event, "tkey") or ""
        haystack = f"{event.source or ''} {event.kind or ''} {tkey}"
        tkeys.update(match.lower() for match in _TKEY_PATTERN.findall(haystack))
        if event.timestamp and (
            last_event_at is None or event.timestamp > last_event_at
        ):
            last_event_at = event.timestamp

    if count == 0:
        status = "absent"
    elif tkeys:
        status = "active"
    else:
        status = "idle"

    return ShotcounterStatus(
        status=status,
        last_event_at=last_event_at,
        tkeys_seen=sorted(tkeys),
        event_count=count,
    )


def derive_producer_status(source: HZDRSource) -> HZDRProducerStatus:
    """Build the combined producer-status view for one HZDR source."""
    return HZDRProducerStatus(
        source_key=source.key,
        watchdog_hosts=derive_watchdog_hosts(source),
        shotcounter=derive_shotcounter_status(source),
    )
