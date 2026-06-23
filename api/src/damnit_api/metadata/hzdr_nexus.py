"""Canonical HZDR shot reconciliation and NeXus bridge helpers."""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import re
import shutil
import sqlite3
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from operator import itemgetter
from typing import TYPE_CHECKING, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import h5py
import numpy as np

from .hzdr_event import EVENT_REQUIRED_FIELDS, check_values_size

if TYPE_CHECKING:
    from collections.abc import Iterable, Iterator
    from pathlib import Path

logger = logging.getLogger(__name__)


class BuilderAlreadyRunningError(RuntimeError):
    """Another hzdr-hdf5-builder invocation already holds the output lock."""


_WIN_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
_WIN_ERROR_INVALID_PARAMETER = 87


def _pid_is_alive_windows(pid: int) -> bool:
    """Windows has no signal-0 probe; os.kill(pid, 0) raises a generic
    OSError for *any* invalid pid, alive or not, so it can't distinguish
    them. OpenProcess + GetLastError can: error 87 (ERROR_INVALID_PARAMETER)
    means no such pid; anything else (e.g. 5, access denied) means it exists
    but we can't query it, so treat that as alive."""
    import ctypes

    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(_WIN_PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if handle:
        kernel32.CloseHandle(handle)
        return True
    return kernel32.GetLastError() != _WIN_ERROR_INVALID_PARAMETER


def _pid_is_alive(pid: int) -> bool:
    """Best-effort liveness check, used only to reclaim a stale lock file."""
    if pid <= 0:
        return False
    if os.name == "nt":
        return _pid_is_alive_windows(pid)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # Process exists but is owned by someone else - treat as alive.
        return True
    except OSError:
        # Conservatively treat any other unexpected failure as "alive" so we
        # never steal a lock we can't actually verify is stale.
        return True
    return True


@contextlib.contextmanager
def single_writer_lock(output_path: Path) -> Iterator[None]:
    """Guard one campaign's builder output against a second concurrent run.

    `hzdr-hdf5-builder.py` is invoked manually/by cron with no orchestration
    above it; two invocations for the same --output-nexus would otherwise
    race on the same NeXus/catalog files. This takes an exclusive,
    PID-stamped lock file next to `output_path` (atomic create via O_EXCL on
    both POSIX and Windows) and removes it on exit. A lock file left behind
    by a crashed/killed process is reclaimed automatically once its PID is no
    longer alive, so a crash does not require manual cleanup before the next
    run. This is single-writer locking only - it does not replace
    write_json_atomic's protection for concurrent *readers*.
    """
    lock_path = output_path.with_name(f"{output_path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        stale = False
        try:
            holder_pid = int(lock_path.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            holder_pid = -1
        if not _pid_is_alive(holder_pid):
            stale = True
            with contextlib.suppress(OSError):
                lock_path.unlink()
            try:
                fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except FileExistsError as exc:
                # Lost the race to reclaim it - someone else got there first.
                message = f"Builder output is locked by another process: {lock_path}"
                raise BuilderAlreadyRunningError(message) from exc
        if not stale:
            message = (
                f"Builder output is locked by pid {holder_pid}: {lock_path}. "
                "If that process is no longer running, remove the lock file "
                "and retry."
            )
            raise BuilderAlreadyRunningError(message) from None
    try:
        os.write(fd, str(os.getpid()).encode("ascii"))
        os.close(fd)
        yield
    finally:
        with contextlib.suppress(OSError):
            lock_path.unlink()


MATCH_RANK = {
    "unmatched": 0,
    "labfrog_only": 1,
    "nearest_time": 2,
    "shot_number_time_window": 3,
    "exact_day_shot_number_time_window": 4,
    "exact_day_shot_number": 5,
    "event_identity": 6,
    "exact_transport_position": 7,
    "exact_kafka_event_id": 8,
}


def write_json_atomic(path: Path, payload: Any) -> None:
    """Write hzdr_sources.json (derived/review/catalog state) atomically.

    JSONL under events/ is the staged source-event log and is only ever
    appended to; this file (and any other catalog/review JSON DAMNIT-web
    writes) is fully rebuilt/rewritten on every update, so a writer crashing
    or being killed mid-write must not leave a half-written file for the next
    reader (e.g. a concurrent GET /metadata/hzdr/sources/{key}/review) to
    trip over. Write to a sibling temp file in the same directory, then
    replace() it over the target - Path.replace (os.replace under the hood)
    is atomic on the same filesystem on both POSIX and Windows, unlike a
    plain write_text().
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        temp_path.replace(path)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise


REVIEW_LEVELS = ("BASE", "REVIEWED", "VERIFIED")
_REVIEW_LEVEL_RANK = {level: rank for rank, level in enumerate(REVIEW_LEVELS)}


def review_sidecar_path(sources_file: Path) -> Path:
    """Return the operator-decision sidecar path next to sources_file."""
    return sources_file.with_name(sources_file.stem + ".review.jsonl")


def append_review_decision(
    sources_file: Path,
    *,
    source_key: str,
    event_id: str,
    action: str,
    by: str,
    note: str | None = None,
    shot_key: str | None = None,
    candidate_shot_keys: list[str] | None = None,
    review_level: str = "REVIEWED",
) -> None:
    """Append one operator review decision to the durable sidecar JSONL.

    The sidecar (``<sources_file_stem>.review.jsonl``) survives builder
    rebuilds: ``write_sources_catalog`` merges decisions back in at publish
    time so confirm/dismiss actions are not lost when the builder reruns.

    ``review_level`` is one of ``"BASE"`` (matcher output, not stored here),
    ``"REVIEWED"`` (operator action), or ``"VERIFIED"`` (countersigned). The
    highest-rank decision for each ``event_id`` wins when merging.

    ``action`` is one of ``"confirm"`` (with ``shot_key``) or ``"dismiss"``.
    The full event shape (source, kind, timestamp) is not duplicated here;
    only identity and the decision matter for merge. ``candidate_shot_keys``
    is stored so a rebuild can re-validate the shot_key is still a candidate.
    """
    if review_level not in _REVIEW_LEVEL_RANK:
        message = f"review_level must be one of {REVIEW_LEVELS}"
        raise ValueError(message)
    record: dict[str, Any] = {
        "source_key": source_key,
        "event_id": event_id,
        "action": action,
        "review_level": review_level,
        "by": by,
        "at": datetime.now(UTC).isoformat(),
        "note": note,
    }
    if shot_key is not None:
        record["shot_key"] = shot_key
    if candidate_shot_keys is not None:
        record["candidate_shot_keys"] = candidate_shot_keys
    sidecar = review_sidecar_path(sources_file)
    sidecar.parent.mkdir(parents=True, exist_ok=True)
    with sidecar.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def load_review_decisions(
    sources_file: Path, source_key: str
) -> dict[str, dict[str, Any]]:
    """Load the highest-precedence decision per event_id from the sidecar.

    Returns a mapping of ``event_id`` → decision record. If the same event
    has multiple entries (e.g. REVIEWED then VERIFIED), the one with the
    highest ``review_level`` rank wins; ties go to the last entry (latest in
    time, since entries are appended in order).
    """
    sidecar = review_sidecar_path(sources_file)
    if not sidecar.exists():
        return {}
    decisions: dict[str, dict[str, Any]] = {}
    for lineno, raw in enumerate(sidecar.read_text(encoding="utf-8").splitlines(), 1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            record = json.loads(raw)
        except json.JSONDecodeError as exc:
            msg = f"Corrupt review sidecar {sidecar}, line {lineno}: {exc}"
            raise ValueError(msg) from exc
        if record.get("source_key") != source_key:
            continue
        event_id = record.get("event_id")
        if not event_id:
            continue
        existing = decisions.get(event_id)
        incoming_rank = _REVIEW_LEVEL_RANK.get(record.get("review_level", ""), -1)
        existing_rank = _REVIEW_LEVEL_RANK.get(
            (existing or {}).get("review_level", ""), -1
        )
        if existing is None or incoming_rank >= existing_rank:
            decisions[event_id] = record
    return decisions


def _apply_review_decisions(
    review_events: list[dict[str, Any]],
    shots: list[dict[str, Any]],
    decisions: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Merge durable operator decisions into freshly-built catalog lists.

    Mutates ``shots`` in-place (attaching confirmed events) and returns a
    filtered ``review_events`` list (confirmed events removed, dismissed ones
    flagged). Called by ``write_sources_catalog`` after ``decisions`` is loaded
    from the sidecar, so a builder rebuild restores prior operator actions.
    """
    if not decisions:
        return review_events, shots

    shots_by_key: dict[str, dict[str, Any]] = {}
    for shot in shots:
        key = shot.get("shot_key")
        if key and key not in shots_by_key:
            shots_by_key[key] = shot

    remaining: list[dict[str, Any]] = []
    for event in review_events:
        event_id = event.get("event_id")
        decision = decisions.get(event_id)
        if decision is None:
            remaining.append(event)
            continue

        action = decision.get("action")
        review_level = decision.get("review_level", "REVIEWED")
        by = decision.get("by", "")
        at = decision.get("at", "")
        note = decision.get("note")

        if action == "confirm":
            shot_key = decision.get("shot_key")
            shot = shots_by_key.get(shot_key) if shot_key else None
            if shot is None:
                # Shot may have been renumbered; keep as review event.
                remaining.append(event)
                continue
            attached = {
                k: v
                for k, v in event.items()
                if k not in {"match_status", "experiment_id", "candidate_shot_keys"}
            }
            attached["match_quality"] = "operator_confirmed"
            attached["review_level"] = review_level
            shot.setdefault("events", []).append(attached)
            shot["match_status"] = "matched"
            history = shot.setdefault("metadata", {}).setdefault(
                "match_confirmation_history", []
            )
            if isinstance(history, list):
                history.append({
                    "at": at,
                    "event_id": event_id,
                    "by": by,
                    "note": note or "Confirmed ambiguous match",
                    "review_level": review_level,
                })
        elif action == "dismiss":
            flagged = dict(event)
            flagged["acknowledged"] = True
            flagged["acknowledged_at"] = at
            flagged["acknowledged_by"] = by
            flagged["acknowledged_note"] = note or "Acknowledged with no shot attached"
            flagged["review_level"] = review_level
            remaining.append(flagged)
        else:
            remaining.append(event)

    return remaining, shots


def load_normalized_events(paths: Iterable[Path]) -> list[dict[str, Any]]:
    """Load normalized events from JSON or JSONL files.

    Raises ValueError (not a raw JSONDecodeError) naming the file and, for
    JSONL, the 1-based line number, so a corrupt staged event - e.g. a
    truncated line from a crash mid-append, or a hand-edited fixture typo -
    is something a developer can locate immediately instead of a bare
    "Expecting value: line 1 column 1" with no file context.
    """
    events: list[dict[str, Any]] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        records = (
            _load_jsonl_records(path, text)
            if path.suffix.lower() == ".jsonl"
            else [_load_json_record(path, text)]
        )
        for record in records:
            missing = sorted(EVENT_REQUIRED_FIELDS - set(record))
            if missing:
                message = f"{path} is missing normalized event field(s): " + ", ".join(
                    missing
                )
                raise ValueError(message)
            if not isinstance(record["payload_ref"], dict):
                message = f"{path} payload_ref must be an object"
                raise ValueError(message)
            values_error = check_values_size(record.get("values"))
            if values_error:
                message = f"{path}: {values_error}"
                raise ValueError(message)
            events.append(record)
    return events


def _load_jsonl_records(path: Path, text: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError as exc:
            message = f"{path}:{line_number} is not valid JSON: {exc.msg}"
            raise ValueError(message) from exc
    return records


def _load_json_record(path: Path, text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        message = f"{path} is not valid JSON: {exc.msg}"
        raise ValueError(message) from exc


def read_labfrog_nexus_shots(path: Path) -> list[dict[str, Any]]:
    """Read the compact LabFrog shot table without interpreting rich metadata."""
    with h5py.File(path, "r") as handle:
        if "/entry/shots" not in handle:
            message = f"{path} does not contain /entry/shots"
            raise ValueError(message)
        group = handle["/entry/shots"]
        count = _table_length(group)
        fields = {
            name: _read_hdf5_column(group, name, count)
            for name in (
                "record_id",
                "shot_number",
                "shot_date",
                "date_time",
                "campaign",
                "has_newer_version",
            )
        }

    shots: list[dict[str, Any]] = []
    for index in range(count):
        has_newer_version = _as_bool(fields["has_newer_version"][index])
        labfrog_time = _as_optional_string(fields["date_time"][index])
        shot_date = _as_optional_string(fields["shot_date"][index])
        if not shot_date:
            shot_date = source_date(labfrog_time)
        shots.append({
            "record_index": index,
            "record_id": _as_optional_string(fields["record_id"][index]),
            "shot_number": _as_optional_int(fields["shot_number"][index]),
            "shot_date": shot_date,
            "labfrog_date_time": labfrog_time,
            "campaign": _as_optional_string(fields["campaign"][index]),
            "metadata": {
                "labfrog_record_index": index,
                "has_newer_version": has_newer_version,
            },
        })
    return shots


def read_labfrog_sqlite_shots(path: Path) -> list[dict[str, Any]]:
    """Read LabFrog's canonical SQLite shots table using its stable columns."""
    with sqlite3.connect(path) as connection:
        columns = {
            str(row[1]) for row in connection.execute("PRAGMA table_info(shots)")
        }
        if not columns:
            message = f"{path} does not contain a shots table"
            raise ValueError(message)
        requested = [
            name
            for name in (
                "mongo_id",
                "shot_number",
                "date_time",
                "date_time_utc",
                "date_time_timezone",
                "campaign",
                "experiment_id",
                "status",
                "version",
                "kafka_topic",
                "kafka_partition",
                "kafka_offset",
                "kafka_key",
                "kafka_value",
                "kafka_event_id",
                "kafka_experiment_id",
                "kafka_shot_number",
                "kafka_timestamp",
                "kafka_source",
                "damnit_shot_key",
                "damnit_match_quality",
            )
            if name in columns
        ]
        rows = connection.execute(
            f"SELECT {', '.join(requested)} FROM shots "  # noqa: S608
            "ORDER BY CASE WHEN date_time IS NULL THEN 1 ELSE 0 END, "
            "date_time, shot_number, mongo_id"
        ).fetchall()

    shots: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        record = dict(zip(requested, row, strict=True))
        local_time = _as_optional_string(record.get("date_time"))
        labfrog_time = _as_optional_string(record.get("date_time_utc")) or local_time
        # experiment_id is promoted to the top-level shot field (the single
        # location select_experiment_id reads), so it is excluded here rather
        # than left duplicated in metadata.
        metadata = {
            key: value
            for key, value in record.items()
            if key
            not in {
                "mongo_id",
                "shot_number",
                "date_time",
                "date_time_utc",
                "campaign",
                "experiment_id",
            }
            and value is not None
            and value != ""
        }
        shot_record = {
            "record_index": index,
            "record_id": _as_optional_string(record.get("mongo_id")),
            "shot_number": _as_optional_int(record.get("shot_number")),
            "shot_date": source_date(local_time) or source_date(labfrog_time),
            "labfrog_date_time": labfrog_time,
            "campaign": _as_optional_string(record.get("campaign")),
            "metadata": metadata,
        }
        experiment_id = _as_optional_string(record.get("experiment_id"))
        if experiment_id is not None:
            shot_record["experiment_id"] = experiment_id
        shots.append(shot_record)
    _mark_superseded_labfrog_rows(shots)
    return shots


def _row_version(row: dict[str, Any]) -> int | None:
    """Parse a curated LabFrog row `version`, or None when absent/unparseable."""
    raw = row.get("metadata", {}).get("version")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _warn_if_active_row_not_latest(
    active_rows: list[dict[str, Any]], rows: list[dict[str, Any]]
) -> None:
    """Warn when the curated export marks a non-latest row `active`.

    The supersede decision is keyed on `status == active` (an accepted pilot
    simplification), which is correct only if the export marks the newest row
    active. When a `version` is present we can detect the malformed case where
    an older row is active and surface it without changing the decision.
    """
    known_versions = [v for v in (_row_version(r) for r in rows) if v is not None]
    if not known_versions:
        return
    max_version = max(known_versions)
    active_versions = [_row_version(r) for r in active_rows]
    if any(v is not None and v < max_version for v in active_versions):
        sample = active_rows[0]
        logger.warning(
            "Curated LabFrog export marks a non-latest row active "
            "(campaign=%s shot_date=%s shot_number=%s active_version=%s "
            "max_version=%s); has_newer_version follows status, not version",
            sample.get("campaign"),
            sample.get("shot_date"),
            sample.get("shot_number"),
            active_versions,
            max_version,
        )


def _mark_superseded_labfrog_rows(shots: list[dict[str, Any]]) -> None:
    """Prefer current LabFrog rows when curated exports include history rows."""
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for shot in shots:
        grouped[
            shot.get("campaign"),
            shot.get("shot_date"),
            shot.get("shot_number"),
        ].append(shot)

    for rows in grouped.values():
        if len(rows) < 2:
            continue
        active_rows = [
            row
            for row in rows
            if str(row.get("metadata", {}).get("status", "")).casefold() == "active"
        ]
        if not active_rows:
            continue
        _warn_if_active_row_not_latest(active_rows, rows)
        active_ids = {id(row) for row in active_rows}
        for row in rows:
            if id(row) in active_ids:
                row.setdefault("metadata", {}).setdefault("has_newer_version", False)
            else:
                row.setdefault("metadata", {})["has_newer_version"] = True


def normalize_labfrog_mongo_shots(
    records: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Map LabFrog Mongo documents to the same reconciliation input shape."""
    shots: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        shot_number = record.get(
            "shot_number", record.get("shot", record.get("shotNumber"))
        )
        if shot_number is None:
            continue
        labfrog_time = record.get(
            "date_time", record.get("timestamp", record.get("fired_at"))
        )
        if isinstance(labfrog_time, datetime):
            labfrog_time = labfrog_time.isoformat()
        record_id = record.get("_id", record.get("record_id"))
        shots.append({
            "record_index": index,
            "record_id": str(record_id) if record_id is not None else None,
            "shot_number": int(shot_number),
            "shot_date": source_date(labfrog_time),
            "labfrog_date_time": _as_optional_string(labfrog_time),
            "campaign": _as_optional_string(
                record.get("Campaign", record.get("campaign"))
            ),
            "metadata": {
                key: _json_safe(value)
                for key, value in record.items()
                if key
                not in {
                    "_id",
                    "record_id",
                    "shot_number",
                    "shot",
                    "shotNumber",
                    "date_time",
                    "timestamp",
                    "fired_at",
                    "Campaign",
                    "campaign",
                }
            },
        })
    return shots


def merge_labfrog_shots(
    *shot_sets: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge LabFrog exports while preserving the first source's row ordering."""
    merged: list[dict[str, Any]] = []
    by_identity: dict[tuple[Any, ...], dict[str, Any]] = {}
    for records in shot_sets:
        for record in records:
            identity = _labfrog_identity(record)
            existing = by_identity.get(identity)
            if existing is None:
                copied = {**record, "metadata": dict(record.get("metadata", {}))}
                by_identity[identity] = copied
                merged.append(copied)
                continue
            for field in (
                "record_id",
                "shot_number",
                "shot_date",
                "labfrog_date_time",
                "campaign",
            ):
                if existing.get(field) in (None, "") and record.get(field) not in (
                    None,
                    "",
                ):
                    existing[field] = record[field]
            existing.setdefault("metadata", {}).update(record.get("metadata", {}))
    return merged


def reconcile_canonical_shots(  # noqa: C901
    events: list[dict[str, Any]],
    *,
    experiment_id: str,
    source_key: str,
    labfrog_shots: list[dict[str, Any]] | None = None,
    match_tolerance_s: float = 120.0,
    campaign_timezone: str = "UTC",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Link normalized source events to canonical LabFrog shots."""
    labfrog_shots = labfrog_shots or []
    selected_events = [
        dict(event)
        for event in events
        if str(event.get("experiment_id")) == experiment_id
    ]
    normalized_events = _deduplicate_by_event_id(
        _normalize_event(event) for event in selected_events
    )

    if labfrog_shots:
        canonical = [
            _canonical_from_labfrog(record, experiment_id, source_key)
            for record in labfrog_shots
        ]
        for event in normalized_events:
            match, quality, status, candidate_shot_keys = _match_event(
                event,
                canonical,
                match_tolerance_s=match_tolerance_s,
                campaign_timezone=campaign_timezone,
            )
            event["match_quality"] = quality
            event["match_status"] = status
            event["match_time_delta_s"] = None
            event["shot_key"] = ""
            event["candidate_shot_keys"] = candidate_shot_keys
            if match is None:
                continue

            event["shot_key"] = match["shot_key"]
            delta = _time_delta_seconds(
                match.get("labfrog_date_time"),
                event.get("timestamp"),
                campaign_timezone=campaign_timezone,
            )
            event["match_time_delta_s"] = delta
            match["events"].append(_event_api_record(event))
            match["match_status"] = "matched"
            if MATCH_RANK.get(quality, 0) >= MATCH_RANK.get(
                str(match.get("match_quality")), 0
            ):
                match["match_quality"] = quality
                match["match_time_delta_s"] = delta
    else:
        canonical = _canonical_from_event_identities(
            normalized_events,
            experiment_id,
            source_key,
            campaign_timezone=campaign_timezone,
        )

    for shot in canonical:
        shot["metadata"].update(_merged_event_metadata(shot["events"]))
        event_times = [
            parse_datetime(event["timestamp"])
            for event in shot["events"]
            if event.get("timestamp")
        ]
        event_times = [value for value in event_times if value is not None]
        if event_times:
            shot["fired_at"] = min(event_times).isoformat()
        elif shot.get("labfrog_date_time"):
            shot["fired_at"] = str(shot["labfrog_date_time"])
        if not shot["events"]:
            shot["match_status"] = "labfrog-only"
            shot["match_quality"] = "labfrog_only"
        shot["data_products"] = build_event_data_products(
            shot["events"], shot_key=shot["shot_key"]
        )
    if labfrog_shots:
        for shot in canonical:
            labfrog_event = _labfrog_source_event(shot, experiment_id)
            normalized_events.append(labfrog_event)
            shot["events"].append(_event_api_record(labfrog_event))
    return canonical, normalized_events


def build_event_data_products(
    events: Iterable[dict[str, Any]], *, shot_key: str
) -> list[dict[str, Any]]:
    """Build compact product descriptors from normalized source events."""
    products: list[dict[str, Any]] = []
    for event in events:
        event_id = str(event["event_id"])
        source = str(event["source"])
        kind = str(event["kind"])
        values = event.get("values")
        metadata = event.get("metadata", {})
        if isinstance(values, list):
            array = np.asarray(values)
            dataset_path = (
                f"/entry/{source_group_name(source)}/{safe_hdf5_name(kind)}/"
                f"{safe_hdf5_name(event_id)}/values"
            )
            products.append({
                "product_id": f"{event_id}:values",
                "shot_key": shot_key,
                "source": source,
                "kind": "hdf5_dataset",
                "path": None,
                "dataset_name": dataset_path,
                "preview_kind": preview_kind_for_shape(array.shape),
                "shape": [int(value) for value in array.shape],
                "dtype": str(array.dtype),
                "units": _as_optional_string(
                    metadata.get("unit") if isinstance(metadata, dict) else None
                ),
                "metadata": {"event_id": event_id, "source_kind": kind},
            })

        payload_ref = event.get("payload_ref", {})
        if not isinstance(payload_ref, dict):
            continue
        dataset_name = _first_string(
            payload_ref, "dataset_path", "dataset", "hdf5_dataset"
        )
        path = _first_string(
            payload_ref,
            "hdf5_path",
            "filepath",
            "file_path",
            "path",
            "file",
            "uri",
            "url",
        )
        if path or dataset_name:
            products.append({
                "product_id": f"{event_id}:reference",
                "shot_key": shot_key,
                "source": source,
                "kind": "hdf5_dataset" if dataset_name else "file",
                "path": path,
                "dataset_name": dataset_name,
                "preview_kind": _as_optional_string(payload_ref.get("preview_kind")),
                "shape": list(payload_ref.get("shape", []))
                if isinstance(payload_ref.get("shape"), list)
                else [],
                "dtype": _as_optional_string(payload_ref.get("dtype")),
                "units": _as_optional_string(payload_ref.get("units")),
                "metadata": {
                    "event_id": event_id,
                    "transport": event.get("transport"),
                },
            })
    return products


def discover_labfrog_data_products(
    nexus_path: Path, shots: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Describe selected shot-indexed LabFrog datasets without copying data."""
    if not nexus_path.exists() or not shots:
        return []
    products: list[dict[str, Any]] = []
    allowed_prefixes = ("/entry/derived/", "/entry/instrument/laser/")
    with h5py.File(nexus_path, "r") as handle:
        datasets: list[tuple[str, h5py.Dataset]] = []

        def collect(name: str, item: Any) -> None:
            full_name = f"/{name}"
            if (
                isinstance(item, h5py.Dataset)
                and full_name.startswith(allowed_prefixes)
                and item.shape
                and item.shape[0] == len(shots)
                and np.issubdtype(item.dtype, np.number)
            ):
                datasets.append((full_name, item))

        handle.visititems(collect)
        for dataset_name, dataset in datasets:
            item_shape = dataset.shape[1:]
            units = _as_optional_string(dataset.attrs.get("units"))
            for index, shot in enumerate(shots):
                products.append({
                    "product_id": (f"labfrog:{index}:{dataset_name.removeprefix('/')}"),
                    "shot_key": shot["shot_key"],
                    "source": "LabFrog",
                    "kind": "hdf5_dataset",
                    "path": str(nexus_path),
                    "dataset_name": dataset_name,
                    "preview_kind": preview_kind_for_shape(item_shape),
                    "shape": [int(value) for value in item_shape],
                    "dtype": str(dataset.dtype),
                    "units": units,
                    "metadata": {
                        "shot_index": index,
                        "shot_indexed": True,
                    },
                })
    return products


def write_nexus_bridge(
    *,
    output_path: Path,
    experiment_id: str,
    shots: list[dict[str, Any]],
    events: list[dict[str, Any]],
    source_nexus: Path | None = None,
) -> list[dict[str, Any]]:
    """Preserve a LabFrog NeXus file and add the DAMNIT bridge tables."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if source_nexus is not None and source_nexus.resolve() != output_path.resolve():
        shutil.copy2(source_nexus, output_path)

    mode = "r+" if output_path.exists() else "w"
    with h5py.File(output_path, mode) as handle:
        handle.attrs["damnit_bridge_profile"] = "hzdr-canonical-shot-v1"
        handle.attrs["experiment_id"] = experiment_id
        handle.attrs["damnit_bridge_updated_at"] = datetime.now(UTC).isoformat()
        if "default" not in handle.attrs:
            handle.attrs["default"] = "entry"
        entry = handle.require_group("entry")
        if "NX_class" not in entry.attrs:
            entry.attrs["NX_class"] = "NXentry"
        entry.attrs["damnit_shot_table"] = "shots"
        entry.attrs["damnit_source_events"] = "source_events"
        entry.attrs["damnit_data_products"] = "data_products"

        shots_group = entry.require_group("shots")
        if "NX_class" not in shots_group.attrs:
            shots_group.attrs["NX_class"] = "NXcollection"
        existing_count = _table_length(shots_group)
        if existing_count not in (0, len(shots)):
            message = (
                "Canonical shot count does not match the preserved LabFrog "
                f"/entry/shots table ({len(shots)} != {existing_count})"
            )
            raise ValueError(message)
        _write_shot_bridge_columns(
            shots_group, shots, write_identity=existing_count == 0
        )
        _write_source_payloads(entry, events)

        products = [
            product for shot in shots for product in shot.get("data_products", [])
        ]
        for product in products:
            if not product.get("path"):
                product["path"] = str(output_path)
        _write_source_events(entry, events)
        _write_data_products(entry, products, output_path=output_path)
    return products


def write_sources_catalog(
    *,
    sources_file: Path,
    source_key: str,
    experiment_id: str,
    nexus_path: Path,
    shots: list[dict[str, Any]],
    events: list[dict[str, Any]] | None = None,
) -> None:
    """Write DAMNIT-web's compact source catalog from canonical shots.

    `events` is the full normalized event list from `reconcile_canonical_shots`
    (matched, ambiguous, and unmatched). Matched events are already visible via
    their shot's `events` list; here we additionally surface the ambiguous and
    unmatched ones as `review_events`, plus a `match_summary` count, since
    otherwise they are only ever written to the NeXus file's `source_events`
    group and have no API/frontend visibility at all.
    """
    current_shots = [
        dict(shot)
        for shot in shots
        if not _as_bool(shot.get("metadata", {}).get("has_newer_version"))
    ]
    review_events = [
        _review_event_api_record(event)
        for event in (events or [])
        if event.get("match_status") in {"ambiguous", "unmatched"}
    ]
    decisions = load_review_decisions(sources_file, source_key)
    review_events, current_shots = _apply_review_decisions(
        review_events, current_shots, decisions
    )
    match_summary = _build_match_summary(current_shots, review_events)
    payload = {
        "sources": [
            {
                "key": source_key,
                "title": f"HZDR canonical campaign ({experiment_id})",
                "damnit_path": str(sources_file.parent / "damnit" / source_key),
                "data_paths": [str(nexus_path)],
                "metadata": {
                    "facility": "HZDR",
                    "source_type": "canonical-nexus",
                    "integration_profile": "hzdr-canonical-shot-v1",
                    "experiment_id": experiment_id,
                    "canonical_nexus_path": str(nexus_path),
                    "combined_hdf5_path": str(nexus_path),
                    "catalog_built_at": datetime.now(UTC).isoformat(),
                },
                "shots": [
                    {
                        **shot,
                        "hdf5_path": str(nexus_path),
                        "nexus_entry": "/entry",
                    }
                    for shot in current_shots
                ],
                "review_events": review_events,
                "match_summary": match_summary,
            }
        ]
    }
    write_json_atomic(sources_file, payload)


def _review_event_api_record(event: dict[str, Any]) -> dict[str, Any]:
    """Build the API-facing record for one ambiguous or unmatched event.

    Unlike `_event_api_record` (used for events already attached to a shot),
    this keeps `match_status`, `experiment_id`, and `candidate_shot_keys` since
    a reviewer needs them to decide what to do with the event.
    """
    return {
        key: event.get(key)
        for key in (
            "event_id",
            "experiment_id",
            "source",
            "kind",
            "timestamp",
            "transport",
            "payload_ref",
            "metadata",
            "match_status",
            "match_quality",
            "candidate_shot_keys",
        )
        if event.get(key) is not None
    }


def _build_match_summary(
    shots: list[dict[str, Any]], review_events: list[dict[str, Any]]
) -> dict[str, int]:
    """Count matched/ambiguous/unmatched, the literal go-live-gate wording.

    "matched" counts shots whose match_status is "matched" - i.e. at least one
    non-LabFrog event was actually linked to them. Every shot also gets its own
    synthetic LabFrog event appended unconditionally (see the labfrog_event loop
    above), so shot.get("events") is always truthy and cannot be used to tell
    "an external producer matched this shot" from "labfrog-only" - match_status
    is set before that append and is the field that actually distinguishes them.

    confirmed/dismissed reflect operator review actions merged from the
    sidecar (via _apply_review_decisions) before this is called, so they
    survive a rebuild. routers._recompute_match_summary uses the same logic
    for the live catalog-edit path (after a confirm/dismiss HTTP call).
    """
    matched = sum(1 for shot in shots if shot.get("match_status") == "matched")
    ambiguous = sum(
        1 for event in review_events if event.get("match_status") == "ambiguous"
    )
    unmatched = sum(
        1
        for event in review_events
        if event.get("match_status") == "unmatched" and not event.get("acknowledged")
    )
    confirmed = sum(
        1
        for shot in shots
        for event in shot.get("events", [])
        if event.get("match_quality") == "operator_confirmed"
    )
    dismissed = sum(
        1
        for event in review_events
        if event.get("match_status") == "unmatched" and event.get("acknowledged")
    )
    return {
        "matched": matched,
        "ambiguous": ambiguous,
        "unmatched": unmatched,
        "confirmed": confirmed,
        "dismissed": dismissed,
    }


def make_shot_key(experiment_id: str, shot_date: str | None, shot_number: int) -> str:
    """Build the stable cross-system key used by source events and products."""
    date_token = (shot_date or "unknown").replace("-", "")
    return f"{experiment_id}:{date_token}:{shot_number:06d}"


def parse_datetime(value: Any, *, naive_timezone: str = "UTC") -> datetime | None:
    """Parse common ISO timestamps and normalize naive values to UTC."""
    if isinstance(value, datetime):
        parsed = value
    elif value in (None, ""):
        return None
    else:
        try:
            parsed = datetime.fromisoformat(str(value))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=resolve_timezone(naive_timezone))
    return parsed.astimezone(UTC)


def resolve_timezone(name: str) -> ZoneInfo:
    """Resolve a configured IANA timezone and report configuration errors."""
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        message = f"Unknown campaign timezone: {name}"
        raise ValueError(message) from exc


def source_date(value: Any) -> str | None:
    """Keep the calendar date recorded by LabFrog for date-scoped shot IDs."""
    text = _as_optional_string(value)
    if not text:
        return None
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", text)
    return match.group(1) if match else None


def preview_kind_for_shape(shape: Iterable[int]) -> str:
    """Map an array shape to the existing DAMNIT preview vocabulary."""
    dimensions = tuple(shape)
    if not dimensions or dimensions == (1,):
        return "scalar"
    if len(dimensions) == 1:
        return "line"
    if len(dimensions) == 2:
        return "image"
    return "stack"


def source_group_name(source: str) -> str:
    """Map external producer names to stable NeXus group names."""
    normalized = source.lower().replace("planet-", "").replace("_", "-")
    if "laser" in normalized or "asapo" in normalized:
        return "laserdata"
    if "watchdog" in normalized:
        return "watchdog"
    if "labfrog" in normalized or "shotsheet" in normalized:
        return "labfrog"
    return safe_hdf5_name(normalized)


def normalize_watchdog_document(
    document: dict[str, Any], *, experiment_id: str
) -> dict[str, Any]:
    """Adapt a PLANET-Watchdog processed document to the shared event contract."""
    event = document.get("event", {})
    analysis = document.get("analysis", {})
    shot_number = _find_nested_shot_number(document)
    shot_id = str(
        document.get("shot_id")
        or (f"shot-{shot_number:06d}" if shot_number is not None else "")
    )
    if not shot_id:
        message = "Watchdog document does not contain a usable shot identifier"
        raise ValueError(message)
    timestamp = _as_optional_string(
        document.get("timestamp")
        or (event.get("timestamp") if isinstance(event, dict) else None)
    )
    if not timestamp:
        message = "Watchdog document does not contain an event timestamp"
        raise ValueError(message)

    watch = document.get("watch", {})
    watch_name = (
        watch.get("watch_name") if isinstance(watch, dict) else None
    ) or "file"
    payload_ref: dict[str, Any] = {}
    if isinstance(event, dict):
        _copy_payload_ref_fields(event, payload_ref)
        path = _first_string(event, "filepath", "filepath_src", "file_path", "path")
        if path and "filepath" not in payload_ref:
            payload_ref["filepath"] = path
        if event.get("filename"):
            payload_ref["filename"] = event["filename"]
    _copy_payload_ref_fields(document, payload_ref)
    kafka = document.get("_kafka", {})
    if isinstance(kafka, dict):
        _copy_payload_ref_fields(kafka, payload_ref)
    metadata = {
        "watch": _json_safe(watch),
        "analysis": _json_safe(analysis),
    }
    for attachment_name in ("zmq_data", "kafka_data"):
        if attachment_name in document:
            metadata[attachment_name] = _json_safe(document[attachment_name])
    normalized = {
        "experiment_id": experiment_id,
        "shot_id": shot_id,
        "shot_number": shot_number,
        "source": "PLANET-Watchdog",
        "kind": f"watchdog.{safe_hdf5_name(str(watch_name))}",
        "timestamp": timestamp,
        "transport": "kafka",
        "payload_ref": payload_ref,
        "metadata": metadata,
    }
    normalized["event_id"] = _event_id(normalized)
    return normalized


def _normalize_hzdr_event_v1_trigger(
    document: dict[str, Any], *, experiment_id: str | None = None
) -> dict[str, Any]:
    """Pass through a shotcounter hzdr-event-v1 Kafka envelope with minimal adaptation.

    The shotcounter branch emits a flat dict with schema_version, event_id,
    experiment_id, shot_number, source, kind, trigger_role (top-level),
    timestamp, transport, payload_ref, values, and metadata. It is already
    in the canonical shape; we only need to:
    - Override experiment_id if the caller supplies one (builder --experiment-id flag).
    - Normalise shot_id from shot_number, matching the convention used for the
      legacy path.
    - Strip trigger_role from the top level (it belongs in metadata.trigger.role,
      same as the legacy path produces) so downstream code sees one consistent shape.
    """
    selected_experiment = _as_optional_string(
        experiment_id or document.get("experiment_id")
    )
    if not selected_experiment:
        message = "hzdr-event-v1 trigger message does not contain experiment_id"
        raise ValueError(message)

    event_id = _as_optional_string(document.get("event_id"))
    if not event_id:
        message = "hzdr-event-v1 trigger message does not contain event_id"
        raise ValueError(message)

    shot_number = _as_optional_int(document.get("shot_number"))
    trigger_role = safe_hdf5_name(
        _as_optional_string(document.get("trigger_role")) or "threshold_crossing"
    )

    normalized = dict(document)
    normalized["experiment_id"] = selected_experiment
    normalized["shot_id"] = (
        f"shot-{shot_number:06d}"
        if shot_number is not None
        else f"unassigned-{event_id}"
    )
    # trigger_role is a top-level field on the shotcounter envelope; fold it into
    # metadata.trigger.role so readers see the same shape as the legacy path.
    normalized.pop("trigger_role", None)
    metadata = dict(normalized.get("metadata") or {})
    trigger_meta = dict(metadata.get("trigger") or {})
    trigger_meta.setdefault("role", trigger_role)
    metadata["trigger"] = trigger_meta
    normalized["metadata"] = metadata

    if shot_number is None:
        normalized.pop("shot_number", None)

    return normalized


def normalize_processed_trigger_message(
    document: dict[str, Any], *, experiment_id: str | None = None
) -> dict[str, Any]:
    """Adapt a trigger payload to the shared event contract.

    Accepts two shapes:
    - A flat ``hzdr-event-v1`` envelope (shotcounter's Kafka output): returned
      directly after validating the required fields are present, with
      ``experiment_id`` overridden if the caller provides one.
    - The legacy ``processed_message`` wrapper (ZMQ relay / pre-branch Kafka):
      adapted into the same envelope shape.
    """
    if document.get("schema_version") == "hzdr-event-v1":
        return _normalize_hzdr_event_v1_trigger(document, experiment_id=experiment_id)

    payload = document.get("processed_message", document)
    if not isinstance(payload, dict):
        message = "processed_message must be an object"
        raise ValueError(message)

    selected_experiment = _as_optional_string(
        experiment_id or payload.get("experiment_id") or payload.get("Campaign")
    )
    if not selected_experiment:
        message = "Trigger message does not contain Campaign/experiment_id"
        raise ValueError(message)

    channel_id = _as_optional_string(payload.get("channel_id") or payload.get("Name"))
    if not channel_id:
        message = "Trigger message does not contain Name/channel_id"
        raise ValueError(message)

    timestamp = _as_optional_string(
        payload.get("timestamp") or payload.get("Event_timestamp")
    )
    if not timestamp:
        message = "Trigger message does not contain Event_timestamp/timestamp"
        raise ValueError(message)

    shot_number = _as_optional_int(
        payload.get("shot_number") or payload.get("Shot_number")
    )
    trigger_role = safe_hdf5_name(
        _as_optional_string(payload.get("trigger_role") or payload.get("Trigger_role"))
        or "threshold_crossing"
    )
    kafka = document.get("_kafka", {})
    payload_ref: dict[str, Any] = {
        "channel_id": channel_id,
        "key": "processed_message",
    }
    _copy_payload_ref_fields(document, payload_ref)
    _copy_payload_ref_fields(payload, payload_ref)
    if isinstance(kafka, dict):
        _copy_payload_ref_fields(kafka, payload_ref)

    adc_value = payload.get("adc_value", payload.get("ADC_value"))
    metadata = {
        "trigger": {
            "channel_id": channel_id,
            "nickname": payload.get("nickname", payload.get("Nickname")),
            "role": trigger_role,
            "threshold": payload.get("threshold", payload.get("Trigger_threshold")),
            "comparison": payload.get("comparison", ">"),
            "adc_value": adc_value,
            "adc_unit": payload.get("adc_unit", payload.get("ADC_unit")),
            "channel_trigger_count": payload.get(
                "channel_trigger_count", payload.get("Channel_counter")
            ),
            "acquisition_run_id": payload.get("run_id", payload.get("Run_id")),
            "sample_counter_10hz": payload.get(
                "sample_counter_10hz", payload.get("10Hz_counter")
            ),
        },
        "legacy_message_type": "processed_message",
    }
    normalized: dict[str, Any] = {
        "experiment_id": selected_experiment,
        "shot_id": (
            f"shot-{shot_number:06d}" if shot_number is not None else "unassigned"
        ),
        "source": "DRACO-Trigger",
        "kind": f"trigger.{trigger_role}",
        "timestamp": timestamp,
        "transport": "kafka",
        "payload_ref": payload_ref,
        "metadata": metadata,
    }
    if shot_number is not None:
        normalized["shot_number"] = shot_number
    if isinstance(adc_value, int | float):
        normalized["values"] = [float(adc_value)]
    normalized["event_id"] = str(
        document.get("event_id") or payload.get("event_id") or _event_id(normalized)
    )
    if shot_number is None:
        normalized["shot_id"] = f"unassigned-{normalized['event_id']}"
    return normalized


def safe_hdf5_name(value: str) -> str:
    """Return a stable HDF5 path component for source-controlled labels."""
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())
    return cleaned or "unnamed"


def _copy_payload_ref_fields(source: dict[str, Any], target: dict[str, Any]) -> None:
    """Copy canonical traceability aliases into ``payload_ref``.

    Producers still use a few historical field names. Keep those legacy extras
    when already present, but always populate the canonical names used by
    HZDRPayloadRef so replay/debug tooling has one stable place to look.
    """
    for key in ("topic", "partition", "offset"):
        if source.get(key) is not None:
            target[key] = source[key]

    message_key = _first_string(source, "message_key", "key")
    if message_key is not None:
        target["message_key"] = message_key
        target.setdefault("key", message_key)

    uri = _first_string(source, "uri", "file_uri", "fileUri", "url")
    if uri is not None:
        target["uri"] = uri

    path = _first_string(source, "path", "filepath", "file_path", "filepath_src")
    if path is not None:
        target["path"] = path
        if "filepath" in source:
            target.setdefault("filepath", path)

    mongo_id = _first_string(
        source, "mongo_id", "mongoId", "mongodb_id", "mongo_record_id", "_id"
    )
    if mongo_id is not None:
        target["mongo_id"] = mongo_id

    scicat_pid = _first_string(source, "scicat_pid", "scicatPid", "pid")
    if scicat_pid is not None:
        target["scicat_pid"] = scicat_pid


def _canonical_from_labfrog(
    record: dict[str, Any], experiment_id: str, source_key: str
) -> dict[str, Any]:
    shot_number = record.get("shot_number")
    if shot_number is None:
        message = "LabFrog shot rows must contain shot_number"
        raise ValueError(message)
    shot_date = _as_optional_string(record.get("shot_date"))
    return {
        "source_key": source_key,
        "shot_number": int(shot_number),
        "fired_at": _as_optional_string(record.get("labfrog_date_time")) or "",
        "shot_key": make_shot_key(experiment_id, shot_date, int(shot_number)),
        "shot_date": shot_date,
        "labfrog_record_id": _as_optional_string(record.get("record_id")),
        "labfrog_date_time": _as_optional_string(record.get("labfrog_date_time")),
        "match_status": "labfrog-only",
        "match_quality": "labfrog_only",
        "match_time_delta_s": None,
        "metadata": {
            "experiment_id": experiment_id,
            "campaign": record.get("campaign"),
            **record.get("metadata", {}),
        },
        "events": [],
        "data_products": [],
    }


def _labfrog_source_event(shot: dict[str, Any], experiment_id: str) -> dict[str, Any]:
    record_id = shot.get("labfrog_record_id") or shot["shot_key"]
    event = {
        "experiment_id": experiment_id,
        "shot_id": f"shot-{shot['shot_number']:06d}",
        "shot_number": shot["shot_number"],
        "source": "LabFrog",
        "kind": "shotsheet.row",
        "timestamp": shot.get("labfrog_date_time") or shot.get("fired_at") or "",
        "transport": "nexus",
        "payload_ref": {"record_id": record_id, "nexus_path": "/entry/shots"},
        "metadata": {"campaign": shot.get("metadata", {}).get("campaign")},
        "shot_key": shot["shot_key"],
        "match_status": "canonical",
        "match_quality": "canonical_record",
        "match_time_delta_s": None,
    }
    event["event_id"] = (
        f"labfrog-{hashlib.sha256(str(record_id).encode()).hexdigest()[:16]}"
    )
    return event


def _canonical_from_event_identities(
    events: list[dict[str, Any]],
    experiment_id: str,
    source_key: str,
    *,
    campaign_timezone: str,
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, int, str], list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        shot_number = _event_shot_number(event)
        timestamp = parse_datetime(event.get("timestamp"))
        if shot_number is None:
            continue
        shot_date = (
            timestamp.astimezone(resolve_timezone(campaign_timezone)).date().isoformat()
            if timestamp
            else None
        )
        grouped[shot_date or "", shot_number, str(event.get("shot_id"))].append(event)

    shots: list[dict[str, Any]] = []
    for (shot_date, shot_number, shot_id), shot_events in grouped.items():
        shot_key = make_shot_key(experiment_id, shot_date or None, shot_number)
        api_events = []
        for event in shot_events:
            event["shot_key"] = shot_key
            event["match_quality"] = "event_identity"
            event["match_status"] = "matched"
            event["match_time_delta_s"] = None
            api_events.append(_event_api_record(event))
        fired_at = min(
            str(event["timestamp"]) for event in shot_events if event.get("timestamp")
        )
        shots.append({
            "source_key": source_key,
            "shot_number": shot_number,
            "fired_at": fired_at,
            "shot_key": shot_key,
            "shot_date": shot_date or None,
            "labfrog_record_id": None,
            "labfrog_date_time": None,
            "match_status": "matched",
            "match_quality": "event_identity",
            "match_time_delta_s": None,
            "metadata": {
                "experiment_id": experiment_id,
                "shot_id": shot_id,
                **_merged_event_metadata(shot_events),
            },
            "events": api_events,
            "data_products": build_event_data_products(api_events, shot_key=shot_key),
        })
    return sorted(
        shots, key=lambda shot: (shot["shot_date"] or "", shot["shot_number"])
    )


def _identity_match_result(
    matches: list[dict[str, Any]], quality: str
) -> tuple[dict[str, Any] | None, str, str, list[str]] | None:
    if len(matches) == 1:
        return matches[0], quality, "matched", []
    if len(matches) > 1:
        return None, "ambiguous", "ambiguous", [shot["shot_key"] for shot in matches]
    return None


def _shots_matching_event_id(
    event_id: str, candidates: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    return [
        shot
        for shot in candidates
        if _as_optional_string(shot.get("metadata", {}).get("kafka_event_id"))
        == event_id
    ]


def _shots_matching_transport_position(
    payload_ref: dict[str, Any], candidates: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Match on Kafka ``(topic, partition, offset)``, ignoring date scoping.

    This trusts that a transport position is globally unique and stable: the
    curated SQLite export writers (in the sibling LabFrog/shotcounter repos)
    must persist the *original* committed offset for each message and never
    rewrite or renumber it. A topic that is recreated/compacted such that an
    offset is reused would violate this; if that ever happens, fall back to
    identity (``kafka_event_id``) matching instead of offsets.
    """
    topic = _as_optional_string(payload_ref.get("topic"))
    partition = _as_optional_int(payload_ref.get("partition"))
    offset = _as_optional_int(payload_ref.get("offset"))
    if topic is None or partition is None or offset is None:
        return []

    matches = []
    for shot in candidates:
        metadata = shot.get("metadata", {})
        if not isinstance(metadata, dict):
            continue
        if (
            _as_optional_string(metadata.get("kafka_topic")) == topic
            and _as_optional_int(metadata.get("kafka_partition")) == partition
            and _as_optional_int(metadata.get("kafka_offset")) == offset
        ):
            matches.append(shot)
    return matches


def _match_event_identity(
    event: dict[str, Any], candidates: list[dict[str, Any]]
) -> tuple[dict[str, Any] | None, str, str, list[str]]:
    event_id = _as_optional_string(event.get("event_id"))
    if event_id:
        result = _identity_match_result(
            _shots_matching_event_id(event_id, candidates), "exact_kafka_event_id"
        )
        if result is not None:
            return result

    payload_ref = event.get("payload_ref")
    if isinstance(payload_ref, dict):
        result = _identity_match_result(
            _shots_matching_transport_position(payload_ref, candidates),
            "exact_transport_position",
        )
        if result is not None:
            return result
    return None, "unmatched", "unmatched", []


def _match_event(
    event: dict[str, Any],
    shots: list[dict[str, Any]],
    *,
    match_tolerance_s: float,
    campaign_timezone: str,
) -> tuple[dict[str, Any] | None, str, str, list[str]]:
    """Match one event to a canonical shot.

    Returns (matched_shot_or_None, match_quality, match_status, candidate_shot_keys).
    candidate_shot_keys is only populated when match_status is "ambiguous": it lists
    the shot_key of every tied candidate, so a reviewer can be offered exactly the
    shots the matcher actually considered, not the whole source.
    """
    current_shots = [
        shot
        for shot in shots
        if not _as_bool(shot.get("metadata", {}).get("has_newer_version"))
    ]
    candidates = current_shots or shots
    event_time = parse_datetime(event.get("timestamp"))

    identity_match, identity_quality, identity_status, identity_keys = (
        _match_event_identity(event, candidates)
    )
    if identity_match is not None or identity_status == "ambiguous":
        return identity_match, identity_quality, identity_status, identity_keys

    shot_number = _event_shot_number(event)
    event_date = (
        event_time.astimezone(resolve_timezone(campaign_timezone)).date().isoformat()
        if event_time
        else None
    )
    if shot_number is not None and event_date:
        exact = [
            shot
            for shot in candidates
            if shot["shot_number"] == shot_number
            and shot.get("shot_date") == event_date
        ]
        if len(exact) == 1:
            return exact[0], "exact_day_shot_number", "matched", []
        if len(exact) > 1:
            nearest = _unique_nearest_shot(
                exact,
                event_time,
                match_tolerance_s,
                campaign_timezone=campaign_timezone,
            )
            if nearest is not None:
                return nearest, "exact_day_shot_number_time_window", "matched", []
            return None, "ambiguous", "ambiguous", [shot["shot_key"] for shot in exact]

    if shot_number is not None:
        same_number = [
            shot for shot in candidates if shot["shot_number"] == shot_number
        ]
        nearest = _unique_nearest_shot(
            same_number,
            event_time,
            match_tolerance_s,
            campaign_timezone=campaign_timezone,
        )
        if nearest is not None:
            return nearest, "shot_number_time_window", "matched", []
        if len(same_number) > 1:
            return (
                None,
                "ambiguous",
                "ambiguous",
                [shot["shot_key"] for shot in same_number],
            )

    nearest = _unique_nearest_shot(
        candidates,
        event_time,
        match_tolerance_s,
        campaign_timezone=campaign_timezone,
    )
    if nearest is not None:
        return nearest, "nearest_time", "matched", []
    return None, "unmatched", "unmatched", []


def _unique_nearest_shot(
    shots: list[dict[str, Any]],
    event_time: datetime | None,
    tolerance_s: float,
    *,
    campaign_timezone: str,
) -> dict[str, Any] | None:
    if event_time is None:
        return None
    distances: list[tuple[float, dict[str, Any]]] = []
    for shot in shots:
        shot_time = parse_datetime(
            shot.get("labfrog_date_time"), naive_timezone=campaign_timezone
        )
        if shot_time is None:
            continue
        distances.append((abs((shot_time - event_time).total_seconds()), shot))
    distances.sort(key=itemgetter(0))
    if not distances or distances[0][0] > tolerance_s:
        return None
    if len(distances) > 1 and distances[0][0] == distances[1][0]:
        return None
    return distances[0][1]


def _normalize_event(event: dict[str, Any]) -> dict[str, Any]:
    normalized = {**event}
    normalized["event_id"] = str(event.get("event_id") or _event_id(event))
    normalized["metadata"] = (
        dict(event.get("metadata", {}))
        if isinstance(event.get("metadata"), dict)
        else {}
    )
    return normalized


def _deduplicate_by_event_id(
    events: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Drop later events that repeat an already-seen event_id, keep the first.

    A staged JSONL file is an append-only log; a producer retry, an emulator
    re-run over the same fixture, or an at-least-once transport can append the
    same logical event twice. Without this, reconcile_canonical_shots would
    count and attach it twice (double matched/ambiguous/unmatched counts, a
    duplicated row in a shot's events list). event_id is deterministic for a
    given (experiment_id, shot_id, source, kind, timestamp, transport,
    payload_ref) tuple (see _event_id), so an exact repeat - not just two
    events that happen to share a shot - is what gets collapsed here.
    """
    seen: set[str] = set()
    deduplicated: list[dict[str, Any]] = []
    for event in events:
        event_id = str(event["event_id"])
        if event_id in seen:
            continue
        seen.add(event_id)
        deduplicated.append(event)
    return deduplicated


def _event_id(event: dict[str, Any]) -> str:
    payload = json.dumps(
        {
            key: event.get(key)
            for key in (
                "experiment_id",
                "shot_id",
                "source",
                "kind",
                "timestamp",
                "transport",
                "payload_ref",
            )
        },
        sort_keys=True,
        default=str,
    ).encode("utf-8")
    return f"evt-{hashlib.sha256(payload).hexdigest()[:16]}"


def _event_api_record(event: dict[str, Any]) -> dict[str, Any]:
    return {
        key: event.get(key)
        for key in (
            "event_id",
            "source",
            "kind",
            "timestamp",
            "transport",
            "payload_ref",
            "metadata",
            "values",
            "match_quality",
            "match_time_delta_s",
        )
        if event.get(key) is not None
    }


def _merged_event_metadata(events: Iterable[dict[str, Any]]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for event in events:
        metadata = event.get("metadata", {})
        if isinstance(metadata, dict):
            merged.update(metadata)
        values = event.get("values")
        if isinstance(values, list) and values:
            numeric = [
                float(value) for value in values if isinstance(value, int | float)
            ]
            if numeric:
                merged[f"{event.get('kind', 'value')}_mean"] = round(
                    sum(numeric) / len(numeric), 6
                )
    return merged


def _event_shot_number(event: dict[str, Any]) -> int | None:
    for value in (
        event.get("shot_number"),
        event.get("metadata", {}).get("shot_number")
        if isinstance(event.get("metadata"), dict)
        else None,
    ):
        parsed = _as_optional_int(value)
        if parsed is not None:
            return parsed
    match = re.fullmatch(r"shot-(\d+)", str(event.get("shot_id", "")))
    return int(match.group(1)) if match else None


def _find_nested_shot_number(value: Any) -> int | None:  # noqa: C901
    if isinstance(value, dict):
        for key in ("shot_number", "shotNumber", "shot", "shot_id"):
            if key in value:
                parsed = _as_optional_int(value[key])
                if parsed is not None:
                    return parsed
                match = re.search(r"(\d+)$", str(value[key]))
                if match:
                    return int(match.group(1))
        for item in value.values():
            parsed = _find_nested_shot_number(item)
            if parsed is not None:
                return parsed
    elif isinstance(value, list):
        for item in value:
            parsed = _find_nested_shot_number(item)
            if parsed is not None:
                return parsed
    return None


def _write_shot_bridge_columns(
    group: h5py.Group, shots: list[dict[str, Any]], *, write_identity: bool
) -> None:
    if write_identity:
        _replace_dataset(group, "shot_index", list(range(len(shots))))
        _replace_dataset(
            group,
            "record_id",
            [shot.get("labfrog_record_id") or "" for shot in shots],
        )
        _replace_dataset(group, "shot_number", [shot["shot_number"] for shot in shots])
        _replace_dataset(
            group, "shot_date", [shot.get("shot_date") or "" for shot in shots]
        )
        _replace_dataset(
            group,
            "date_time",
            [shot.get("labfrog_date_time") or "" for shot in shots],
        )
    columns = {
        "shot_key": [shot["shot_key"] for shot in shots],
        "fired_at": [shot.get("fired_at") or "" for shot in shots],
        "labfrog_date_time": [shot.get("labfrog_date_time") or "" for shot in shots],
        "match_status": [shot.get("match_status") or "" for shot in shots],
        "match_quality": [shot.get("match_quality") or "" for shot in shots],
        "match_time_delta_s": [
            np.nan
            if shot.get("match_time_delta_s") is None
            else shot["match_time_delta_s"]
            for shot in shots
        ],
    }
    for name, values in columns.items():
        _replace_dataset(group, name, values)
    group.attrs["damnit_bridge_profile"] = "hzdr-canonical-shot-v1"
    group.attrs["stable_key"] = "shot_key"


def _write_source_payloads(entry: h5py.Group, events: list[dict[str, Any]]) -> None:
    for event in events:
        values = event.get("values")
        if not isinstance(values, list):
            continue
        event_group = (
            entry
            .require_group(source_group_name(str(event["source"])))
            .require_group(safe_hdf5_name(str(event["kind"])))
            .require_group(safe_hdf5_name(str(event["event_id"])))
        )
        _replace_dataset(event_group, "values", np.asarray(values))
        event_group.attrs["event_id"] = str(event["event_id"])
        event_group.attrs["shot_key"] = str(event.get("shot_key") or "")
        event_group.attrs["source"] = str(event["source"])
        event_group.attrs["kind"] = str(event["kind"])


def _write_source_events(entry: h5py.Group, events: list[dict[str, Any]]) -> None:
    group = _replace_group(entry, "source_events")
    group.attrs["NX_class"] = "NXcollection"
    group.attrs["description"] = "Normalized source events linked to canonical shots."
    columns = {
        "event_index": list(range(len(events))),
        "event_id": [event["event_id"] for event in events],
        "experiment_id": [event["experiment_id"] for event in events],
        "shot_key": [event.get("shot_key") or "" for event in events],
        "source": [event["source"] for event in events],
        "kind": [event["kind"] for event in events],
        "timestamp": [event["timestamp"] for event in events],
        "shot_number": [
            -1 if _event_shot_number(event) is None else _event_shot_number(event)
            for event in events
        ],
        "source_ref": [event.get("transport") or "" for event in events],
        "payload_ref_json": [
            json.dumps(event.get("payload_ref", {}), sort_keys=True) for event in events
        ],
        "metadata_json": [
            json.dumps(event.get("metadata", {}), sort_keys=True, default=str)
            for event in events
        ],
        "match_status": [event.get("match_status") or "" for event in events],
        "match_quality": [event.get("match_quality") or "" for event in events],
        "match_time_delta_s": [
            np.nan
            if event.get("match_time_delta_s") is None
            else event["match_time_delta_s"]
            for event in events
        ],
        "candidate_shot_keys_json": [
            json.dumps(event.get("candidate_shot_keys") or []) for event in events
        ],
    }
    for name, values in columns.items():
        _replace_dataset(group, name, values)


def _write_data_products(
    entry: h5py.Group, products: list[dict[str, Any]], *, output_path: Path
) -> None:
    group = _replace_group(entry, "data_products")
    group.attrs["NX_class"] = "NXcollection"
    group.attrs["description"] = "Per-shot references to previewable or external data."
    columns = {
        "product_index": list(range(len(products))),
        "product_id": [product["product_id"] for product in products],
        "shot_key": [product.get("shot_key") or "" for product in products],
        "source": [product.get("source") or "" for product in products],
        "kind": [product.get("kind") or "" for product in products],
        "path": [product.get("path") or str(output_path) for product in products],
        "dataset_path": [product.get("dataset_name") or "" for product in products],
        "preview_kind": [product.get("preview_kind") or "" for product in products],
        "dtype": [product.get("dtype") or "" for product in products],
        "shape_json": [json.dumps(product.get("shape", [])) for product in products],
        "units": [product.get("units") or "" for product in products],
        "metadata_json": [
            json.dumps(product.get("metadata", {}), sort_keys=True, default=str)
            for product in products
        ],
    }
    for name, values in columns.items():
        _replace_dataset(group, name, values)


def _replace_group(parent: h5py.Group, name: str) -> h5py.Group:
    if name in parent:
        del parent[name]
    return parent.create_group(name)


def _replace_dataset(group: h5py.Group, name: str, values: Any) -> h5py.Dataset:
    if name in group:
        del group[name]
    array = np.asarray(values)
    if array.dtype.kind in {"U", "O"}:
        dtype = h5py.string_dtype(encoding="utf-8")
        array = np.asarray(
            ["" if value is None else str(value) for value in values], dtype=dtype
        )
    return group.create_dataset(name, data=array)


def _table_length(group: h5py.Group) -> int:
    for name in ("shot_index", "record_index", "record_id", "shot_number"):
        item = group.get(name)
        if isinstance(item, h5py.Dataset) and item.ndim >= 1:
            return int(item.shape[0])
    return 0


def _read_hdf5_column(group: h5py.Group, name: str, count: int) -> list[Any]:
    item = group.get(name)
    if not isinstance(item, h5py.Dataset):
        return [None] * count
    values = item.asstr()[...] if item.dtype.kind in {"S", "O", "U"} else item[...]
    if np.asarray(values).ndim == 0:
        return [np.asarray(values).item()] * count
    return [_python_scalar(value) for value in values]


def _labfrog_identity(record: dict[str, Any]) -> tuple[Any, ...]:
    if record.get("record_id"):
        return ("record", str(record["record_id"]))
    return (
        "shot",
        record.get("campaign"),
        record.get("shot_date"),
        record.get("shot_number"),
    )


def _time_delta_seconds(
    labfrog_time: Any, fired_at: Any, *, campaign_timezone: str
) -> float | None:
    left = parse_datetime(labfrog_time, naive_timezone=campaign_timezone)
    right = parse_datetime(fired_at)
    return (left - right).total_seconds() if left and right else None


def _as_optional_string(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(_python_scalar(value))


def _as_optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(_python_scalar(value))
    except (TypeError, ValueError):
        return None


def _as_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes"}
    return bool(_python_scalar(value)) if value is not None else False


def _python_scalar(value: Any) -> Any:
    return value.item() if isinstance(value, np.generic) else value


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_json_safe(item) for item in value]
    return _python_scalar(value)


def _first_string(mapping: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = _as_optional_string(mapping.get(key))
        if value:
            return value
    return None
