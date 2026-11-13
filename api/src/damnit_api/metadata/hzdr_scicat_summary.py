"""Bounded searchable campaign metadata from canonical shots and source events."""

from __future__ import annotations

import json
import math
from collections import Counter
from contextlib import suppress
from importlib.metadata import PackageNotFoundError, version
from itertools import chain
from typing import TYPE_CHECKING, Any

import h5py

from .hzdr_event import METADATA_KEY_REGISTRY
from .hzdr_nexus import (
    HZDR_BRIDGE_PROFILE_VERSION,
    _as_bool,
    _normalize_target_metadata,
    _shot_authority_column_value,
    parse_datetime,
    shot_container_links,
)

if TYPE_CHECKING:
    from collections.abc import Iterable
    from pathlib import Path

MAX_VALUES = 64
MAX_TEXT = 256
TARGET_FIELDS = (
    "name",
    "type",
    "material",
    "thickness",
    "diameter",
    "temperature",
    "gas_species",
    "gas_pressure",
    "provenance",
    "wiki_page",
    "wiki_ref",
)


def _bounded(values: Iterable[Any]) -> dict[str, Any]:
    """Retain at most 64 distinct, deterministic values without keeping every shot."""
    kept: dict[str, Any] = {}
    omitted = False
    for value in values:
        if value is None:
            continue
        key = json.dumps(value, sort_keys=True, allow_nan=False)
        if key in kept:
            continue
        kept[key] = value
        if len(kept) > MAX_VALUES:
            del kept[max(kept)]
            omitted = True
    return {"values": [kept[key] for key in sorted(kept)], "truncated": omitted}


def _text(value: Any) -> str | None:
    return value if isinstance(value, str) and 0 < len(value) <= MAX_TEXT else None


def _instrument_id(record: dict[str, Any]) -> str | None:
    instrument = record.get("metadata", {}).get("instrument")
    return _text(instrument.get("id")) if isinstance(instrument, dict) else None


def _target(shot: dict[str, Any]) -> dict[str, Any] | None:
    target = _normalize_target_metadata(shot.get("metadata", {}).get("target")) or {}
    selected = {}
    for key in TARGET_FIELDS:
        value = target.get(key)
        unit = METADATA_KEY_REGISTRY.get(f"target.{key}")
        if type(value) in {int, float} and math.isfinite(value):
            selected[key] = {"value": value, "unit": unit} if unit else value
        elif _text(value):
            selected[key] = value
    return selected or None


def _number_coverage(values: Iterable[Any]) -> dict[str, int]:
    present = missing = 0
    minimum = maximum = None
    for value in values:
        if type(value) is not int or value < 0:
            missing += 1
            continue
        present += 1
        minimum = value if minimum is None else min(minimum, value)
        maximum = value if maximum is None else max(maximum, value)
    result = {"present": present, "missing": missing}
    if minimum is not None:
        result.update(minimum=minimum, maximum=maximum)
    return result


def _time_coverage(shots: list[dict[str, Any]]) -> dict[str, Any]:
    earliest = latest = None
    missing = 0
    for shot in shots:
        parsed = parse_datetime(shot.get("fired_at"))
        if parsed is None:
            missing += 1
            continue
        earliest = parsed if earliest is None else min(earliest, parsed)
        latest = parsed if latest is None else max(latest, parsed)
    result: dict[str, Any] = {
        "shots_with_time": len(shots) - missing,
        "shots_missing_time": missing,
    }
    if earliest is not None:
        result.update(start=earliest.isoformat(), end=latest.isoformat())
    return result


def _counts(values: Iterable[Any]) -> dict[str, Any]:
    # Canonical statuses/sources have a small vocabulary; cap unexpected keys.
    counts: Counter[str] = Counter()
    omitted = 0
    for value in values:
        name = _text(value) or "unknown"
        counts[name] += 1
        if len(counts) > MAX_VALUES:
            omitted += counts.pop(max(counts))
    return {"counts": dict(sorted(counts.items())), "omitted_records": omitted}


def campaign_summary(
    experiment_id: str,
    shots: list[dict[str, Any]],
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    """Summarize only canonical fields; omit notes and per-shot/event dumps."""
    active = [
        s for s in shots if not _as_bool(s.get("metadata", {}).get("has_newer_version"))
    ]
    instruments = _bounded(_instrument_id(record) for record in chain(active, events))
    keys = Counter(s["shot_key"] for s in active if _text(s.get("shot_key")))
    duplicate_keys = {key: count for key, count in keys.items() if count > 1}
    summary = {
        "schema_version": "hzdr-scicat-campaign-summary-v1",
        "campaign_id": experiment_id,
        "facility": "HZDR",
        "shot_count": len(active),
        "shot_count_semantics": (
            "current canonical records; not a distinct physical-shot count"
        ),
        "record_identity_coverage": {
            "distinct_shot_keys": len(keys),
            "records_missing_shot_key": len(active) - sum(keys.values()),
            "duplicate_shot_key_groups": len(duplicate_keys),
            "records_in_duplicate_groups": sum(duplicate_keys.values()),
            "duplicate_shot_keys": _bounded(duplicate_keys),
            "source_review_required": bool(duplicate_keys),
        },
        "superseded_shot_records": len(shots) - len(active),
        "time_coverage": _time_coverage(active),
        "authority_numbers": _number_coverage(
            _shot_authority_column_value(s) for s in active
        ),
        "labfrog_local_counts": _number_coverage(
            s.get("labfrog_local_count") for s in active
        ),
        "labfrog_records": sum(bool(s.get("labfrog_record_id")) for s in active),
        "shot_keys_present": sum(bool(s.get("shot_key")) for s in active),
        "instruments": instruments,
        "instrument_records_without_id": sum(
            _instrument_id(record) is None for record in chain(active, events)
        ),
        "targets": _bounded(_target(shot) for shot in active),
        "shots_missing_target": sum(_target(shot) is None for shot in active),
        "shot_match_status": _counts(s.get("match_status") for s in active),
        "event_match_status": _counts(e.get("match_status") for e in events),
        "event_review_level": _counts(e.get("review_level") for e in events),
        "event_sources": _counts(e.get("source") for e in events),
        "event_count": len(events),
        "provenance": {
            "shots": "canonical reconciliation; current LabFrog versions only",
            "events": "normalized hzdr-event-v1",
            "target_units": "canonical metadata key registry",
            "bridge_profile": HZDR_BRIDGE_PROFILE_VERSION,
        },
    }
    with suppress(PackageNotFoundError):
        summary["provenance"]["builder_version"] = version("damnit-api")
    return summary


def campaign_files(master: Path) -> list[Path]:
    """Select the master and only its explicitly linked shot containers."""
    root = master.parent.resolve()
    selected = {master.resolve()}
    with h5py.File(master, "r") as handle:
        links = shot_container_links(handle)
    if len(links) > 10_000:
        message = "SciCat inventory exceeds 10000 linked containers"
        raise ValueError(message)
    for link in links.values():
        path = (root / link.filename).resolve(strict=True)
        if not path.is_relative_to(root) or not path.is_file():
            message = (
                "SciCat companion must be a regular file inside the campaign folder"
            )
            raise ValueError(message)
        selected.add(path)
    return [master.resolve(), *sorted(selected - {master.resolve()})]
