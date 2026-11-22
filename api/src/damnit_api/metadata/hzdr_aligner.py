"""shot-aligner's day indexes as evidence for the matcher (fork-only).

Plan: hzdr/docs/plans/plan-aligner-bridge.md. shot-aligner fits each
instrument's clock, pairs whole shots with Shotsheet rows by sequence and
time, and lets a reviewer confirm each pair. It writes one day's result to
``<index dir>/<date>.index.json`` and the reviewer's decisions to
``<date>.decisions.json``. This module reads both as written (B2: nothing of
shot-aligner is vendored or recomputed) and gives, per file, the claim the
matcher checks (``hzdr_nexus._apply_aligner_claims``):

- the date, set and event rank of the file's shot-aligner event;
- the Shotsheet row its link names (``excel_row``, set, Count, typed time,
  values), the band of the link, and whether a reviewer confirmed it;
- the LabFrog record shot-aligner matched that row to (``labfrog.matches``),
  and the shot authority's number it mapped the event to on a day without a
  Shotsheet (``labfrog.authority``), where the index has them.

A file is keyed by (date, instrument folder, file name), B3: shot-aligner
lists an acquisition's ``files`` relative to the date folder. An index that
does not parse (shot-aligner writes it in place, so a build can catch one
half written) is skipped with a warning; the next build reads it again.
"""

from __future__ import annotations

import dataclasses
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

logger = logging.getLogger(__name__)

INDEX_SUFFIX = ".index.json"
DECISIONS_SUFFIX = ".decisions.json"
_DATE_FOLDER = re.compile(r"^\d{4}_\d{2}_\d{2}$")


@dataclass(frozen=True, eq=False)  # one object per event: identity is the join
class AlignerClaim:
    """What shot-aligner says about one file's shot."""

    date: str  # ISO, e.g. 2025-12-03
    date_folder: str  # e.g. 2025_12_03
    set_name: str
    event_rank: int
    band: str  # the link's band: confirmed / high / low; "" without a link
    confirmed: bool  # a reviewer's decision stands on this pairing (link_confirmed)
    excel_row: int | None = None
    count: int | None = None
    row_time: str | None = None  # the Shotsheet's Zeit, HH:MM[:SS], local
    row_values: dict[str, Any] = field(default_factory=dict)
    labfrog_record_id: str | None = None  # labfrog.matches, outcome matched
    authority_shot_number: int | None = None  # labfrog.authority, mapped
    index_file: str = ""

    @property
    def event_key(self) -> str:
        """shot-aligner's own name for the event (its ledger key)."""
        return f"{self.set_name}:{self.event_rank}"


FileKey = tuple[str, str, str]  # (date folder, instrument folder, file name)


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        logger.warning("shot-aligner file %s not read: %s", path, error)
        return None
    return data if isinstance(data, dict) else None


def _ledger_links(
    decisions: dict[str, Any] | None,
) -> dict[str, dict[str, Any]] | None:
    """Ledger key (``set:rank``) -> its link decision; None without a ledger."""
    if decisions is None:
        return None
    links = decisions.get("links")
    if not isinstance(links, dict):
        return {}
    return {str(key): entry for key, entry in links.items() if isinstance(entry, dict)}


def link_confirmed(
    band: str,
    decision: dict[str, Any] | None,
    link_count: int | None,
    *,
    has_ledger: bool,
) -> bool:
    """Whether a reviewer's decision stands on this link, as shot-aligner judges it.

    shot-aligner's ``Ledger.pairing``: a decision is keyed by ``set:rank``, but
    what was approved is a pairing. A ``confirm`` records the Count it was
    made against (``matched_count``): it stands when the link still names that
    Count (or it predates the witness, version 1), and not when re-aligning
    moved the event. A ``repin`` stands when the link names the Count it
    forced. A ``reject`` never confirms. Without a ledger, the index's band
    says it. The ledger is read as it is now, so a confirmation made after the
    index was written counts at once (plan backfill-store, found 2026-11-22).
    """
    if decision is None:
        return band == "confirmed" and not has_ledger
    action = decision.get("action")
    if action == "confirm":
        witness = _as_int(decision.get("matched_count"))
        return witness is None or witness == link_count
    if action == "repin":
        forced = _as_int(decision.get("row_count"))
        return link_count is not None and forced == link_count
    return False


def _rows_by_excel_row(index: dict[str, Any]) -> dict[int, dict[str, Any]]:
    shotsheet = index.get("shotsheet")
    rows = shotsheet.get("rows") if isinstance(shotsheet, dict) else None
    return {
        number: row
        for row in rows or []
        if isinstance(row, dict) and (number := _as_int(row.get("excel_row")))
    }


def _labfrog_records_by_row(index: dict[str, Any]) -> dict[int, str]:
    """excel_row -> LabFrog record id, where shot-aligner matched them."""
    block = index.get("labfrog")
    matches = block.get("matches") if isinstance(block, dict) else None
    found: dict[int, str] = {}
    for entry in matches or []:
        if not isinstance(entry, dict) or entry.get("outcome") != "matched":
            continue
        record = entry.get("labfrog")
        row = _as_int(entry.get("excel_row"))
        mongo_id = record.get("mongo_id") if isinstance(record, dict) else None
        if row is not None and mongo_id:
            found[row] = str(mongo_id)
    return found


def _authority_by_event(index: dict[str, Any]) -> dict[tuple[str, int], int]:
    """(set, event rank) -> the authority number shot-aligner mapped it to."""
    block = index.get("labfrog")
    authority = block.get("authority") if isinstance(block, dict) else None
    mappings = authority.get("mappings") if isinstance(authority, dict) else None
    found: dict[tuple[str, int], int] = {}
    for entry in mappings or []:
        if not isinstance(entry, dict) or entry.get("outcome") != "mapped":
            continue
        record = entry.get("labfrog")
        number = (
            _as_int(record.get("authority_shot_number"))
            if isinstance(record, dict)
            else None
        )
        rank = _as_int(entry.get("event_rank"))
        if number is not None and rank is not None:
            found[str(entry.get("set_name")), rank] = number
    return found


def claims_from_index(
    index: dict[str, Any],
    decisions: dict[str, Any] | None = None,
    *,
    index_file: str = "",
) -> dict[FileKey, AlignerClaim]:
    """Every shot file of one day index, keyed by (date folder, folder, name).

    Auxiliary files (alignment, synchro) belong to no shot and are left out.
    A key two events share is dropped: B3, a key that two claims share is no
    join.
    """
    date_folder = str(index.get("date") or "")
    if not _DATE_FOLDER.match(date_folder):
        return {}
    date = date_folder.replace("_", "-")
    rows = _rows_by_excel_row(index)
    records = _labfrog_records_by_row(index)
    authority = _authority_by_event(index)
    ledger = _ledger_links(decisions)
    claims: dict[FileKey, AlignerClaim] = {}
    shared: set[FileKey] = set()
    sets = index.get("sets")
    for set_name, data in (sets or {}).items():
        if not isinstance(data, dict):
            continue
        links = _matched_links(data)
        for event in data.get("events") or []:
            rank = _as_int(event.get("rank")) if isinstance(event, dict) else None
            if rank is None:
                continue
            claim = _claim(
                date,
                date_folder,
                str(set_name),
                rank,
                links.get(rank),
                rows,
                records,
                authority,
                ledger,
                index_file,
            )
            for key in _acquisition_keys(date_folder, event):
                if key in claims and claims[key] is not claim:
                    shared.add(key)
                claims[key] = claim
    for key in shared:
        del claims[key]
    return claims


def _matched_links(data: dict[str, Any]) -> dict[int, dict[str, Any]]:
    """A set's matched links by event rank."""
    return {
        rank: link
        for link in data.get("links") or []
        if isinstance(link, dict)
        and link.get("status") == "matched"
        and (rank := _as_int(link.get("event_rank"))) is not None
    }


def _acquisition_keys(date_folder: str, event: dict[str, Any]) -> list[FileKey]:
    """(date folder, instrument folder, file name) of every file of an event."""
    keys: list[FileKey] = []
    for acquisition in event.get("acquisitions") or []:
        for name in acquisition.get("files") or []:
            path = PurePosixPath(str(name).replace("\\", "/"))
            if len(path.parts) >= 2:
                keys.append((date_folder, path.parts[-2], path.name))
    return keys


def _claim(
    date: str,
    date_folder: str,
    set_name: str,
    rank: int,
    link: dict[str, Any] | None,
    rows: dict[int, dict[str, Any]],
    records: dict[int, str],
    authority: dict[tuple[str, int], int],
    ledger: dict[str, dict[str, Any]] | None,
    index_file: str,
) -> AlignerClaim:
    excel_row = _as_int(link.get("excel_row")) if link else None
    row = rows.get(excel_row) if excel_row is not None else None
    band = str(link.get("band") or "") if link else ""
    count = _as_int(row.get("count")) if isinstance(row, dict) else None
    link_count = _as_int(link.get("row_count")) if link else None
    confirmed = link is not None and link_confirmed(
        band,
        (ledger or {}).get(f"{set_name}:{rank}"),
        count if link_count is None else link_count,
        has_ledger=ledger is not None,
    )
    values = row.get("values") if isinstance(row, dict) else None
    return AlignerClaim(
        date=date,
        date_folder=date_folder,
        set_name=set_name,
        event_rank=rank,
        band=band,
        confirmed=confirmed,
        excel_row=excel_row,
        count=_as_int(row.get("count")) if isinstance(row, dict) else None,
        row_time=(str(row.get("time_text")) or None)
        if isinstance(row, dict) and row.get("time_text")
        else None,
        row_values=dict(values) if isinstance(values, dict) else {},
        labfrog_record_id=records.get(excel_row) if excel_row is not None else None,
        authority_shot_number=authority.get((set_name, rank)),
        index_file=index_file,
    )


def index_files(index_dir: Path) -> list[Path]:
    """The day indexes in ``index_dir`` and the decision files beside them."""
    if not index_dir.is_dir():
        return []
    return sorted(
        path
        for path in index_dir.iterdir()
        if path.name.endswith((INDEX_SUFFIX, DECISIONS_SUFFIX))
        and _DATE_FOLDER.match(path.name.split(".", 1)[0])
    )


def load_aligner_claims(
    index_dir: Path,
    *,
    dates: set[str] | None = None,
    cache_dir: Path | None = None,
    timezone: str = "Europe/Berlin",
) -> dict[FileKey, AlignerClaim]:
    """The claims of every day index in ``index_dir`` (only ``dates``, ISO).

    Plan backfill-store G3: a build passes the dates its events fall on, so
    it reads those indexes alone; with ``cache_dir`` each is read from its
    stored, parsed form while shot-aligner has not changed it (G1).
    """
    claims: dict[FileKey, AlignerClaim] = {}
    for path in index_files(index_dir):
        if not path.name.endswith(INDEX_SUFFIX):
            continue
        date_folder = path.name[: -len(INDEX_SUFFIX)]
        if dates is not None and date_folder.replace("_", "-") not in dates:
            continue
        day = load_day_data(
            index_dir, date_folder, cache_dir=cache_dir, timezone=timezone
        )
        if day is not None:
            claims.update(day.claims)
    return claims


def event_file_keys(event: dict[str, Any]) -> list[tuple[str, str, tuple[str, ...]]]:
    """(folder, name, all path parts) for each file an event names (B3)."""
    payload = event.get("payload_ref")
    payload = payload if isinstance(payload, dict) else {}
    metadata = event.get("metadata")
    metadata = metadata if isinstance(metadata, dict) else {}
    watch = metadata.get("watch")
    watch = watch if isinstance(watch, dict) else {}
    paths: list[str] = []
    if payload.get("path"):
        paths.append(str(payload["path"]))
    paths.extend(
        str(member["path"])
        for member in payload.get("members") or []
        if isinstance(member, dict) and member.get("path")
    )
    if payload.get("filename"):
        folder = watch.get("watch_path") or watch.get("watch_name")
        if folder:
            paths.append(f"{folder}/{payload['filename']}")
    keys: list[tuple[str, str, tuple[str, ...]]] = []
    for raw in paths:
        path = PurePosixPath(raw.replace("\\", "/"))
        if len(path.parts) >= 2:
            keys.append((path.parts[-2], path.name, path.parts))
    return list(dict.fromkeys(keys))


def claim_for_event(
    event: dict[str, Any],
    claims: dict[FileKey, AlignerClaim],
    *,
    local_date: str | None,
) -> AlignerClaim | None:
    """The one claim an event's files lead to, or None (B3).

    The date folder is the one in the file's path, else the event's
    campaign-local date (``local_date``, ISO). Files of one event that lead to
    two different shot-aligner events lead to none.
    """
    found: set[AlignerClaim] = set()
    for folder, name, parts in event_file_keys(event):
        date_folders = [part for part in parts if _DATE_FOLDER.match(part)]
        if not date_folders and local_date:
            date_folders = [local_date.replace("-", "_")]
        for date_folder in date_folders:
            claim = claims.get((date_folder, folder, name))
            if claim is not None:
                found.add(claim)
    return found.pop() if len(found) == 1 else None


# --- this year's campaigns (plan-campaign-backfill) ----------------------------

#: experiment_id_source of a shot made from a Shotsheet row (F3).
SHOTSHEET_SOURCE = "shotsheet"
#: source / kind / transport of a file event made from a day index (F4).
ALIGNER_EVENT_SOURCE = "shot-aligner"
ALIGNER_EVENT_KIND = "shot-aligner.file"
#: The acquisition.time_source values the metadata registry knows.
_TIME_SOURCES = {"filename", "first_seen", "mtime", "none"}


def parse_campaign_dates(pairs: list[str] | None) -> dict[str, list[str]]:
    """``["<campaign>=<YYYY_MM_DD>", ...]`` -> campaign -> its dates (F6)."""
    found: dict[str, list[str]] = {}
    for pair in pairs or []:
        campaign, sep, date = str(pair).partition("=")
        date = date.strip().replace("-", "_")
        if not sep or not campaign.strip() or not _DATE_FOLDER.match(date):
            message = f"--aligner-campaign wants <campaign>=<YYYY_MM_DD>, not {pair!r}"
            raise ValueError(message)
        found.setdefault(campaign.strip(), [])
        if date not in found[campaign.strip()]:
            found[campaign.strip()].append(date)
    return found


def load_day(
    index_dir: Path, date_folder: str
) -> tuple[dict[str, Any], dict[str, Any] | None] | None:
    """One day's index and decisions, or None when the index is not there."""
    path = index_dir / f"{date_folder}{INDEX_SUFFIX}"
    if not path.is_file():
        logger.warning(
            "shot-aligner has no day index for %s in %s", date_folder, index_dir
        )
        return None
    index = _read_json(path)
    if index is None:
        return None
    decisions_path = index_dir / f"{date_folder}{DECISIONS_SUFFIX}"
    decisions = _read_json(decisions_path) if decisions_path.is_file() else None
    return index, decisions


def _row_time(date: str, row: dict[str, Any]) -> str | None:
    """The row's Zeit on its day, naive local (LabFrog's ``date_time`` form)."""
    seconds = _as_int(row.get("time_seconds"))
    if seconds is None:
        return None
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{date}T{hours:02d}:{minutes:02d}:{secs:02d}"


def _row_metadata(row: dict[str, Any]) -> dict[str, Any]:
    """The row's values where LabFrog would keep them, the rest under shotsheet."""
    values = dict(row.get("values") or {})
    metadata: dict[str, Any] = {}
    for key in ("gvd", "tod"):
        if values.get(key) is not None:
            metadata[key] = values.pop(key)
    energy = values.pop("elaser", None)
    if energy is not None:
        metadata["laser"] = {"pulse_energy": energy}
    values.pop("count", None)
    metadata["shotsheet"] = {
        "set": row.get("set_name"),
        "count": _as_int(row.get("count")),
        "excel_row": _as_int(row.get("excel_row")),
        "values": values,
    }
    if row.get("comments"):
        metadata["comments"] = str(row["comments"])
    return metadata


def shotsheet_shots(index: dict[str, Any], experiment_id: str) -> list[dict[str, Any]]:
    """The day's Shotsheet rows as shot records, in LabFrog's record shape (F1, F3).

    Only the rows shot-aligner's inclusion rule counts. ``shot_number`` is the
    row's position in the day (1 to N, sets and rows in workbook order); the
    Count is kept as ``local_count``. No authority number.
    """
    date_folder = str(index.get("date") or "")
    if not _DATE_FOLDER.match(date_folder):
        return []
    date = date_folder.replace("_", "-")
    shotsheet = index.get("shotsheet")
    rows = shotsheet.get("rows") if isinstance(shotsheet, dict) else None
    counted = [
        row
        for row in rows or []
        if isinstance(row, dict)
        and row.get("counted") is True
        and _as_int(row.get("excel_row")) is not None
    ]
    shots = []
    for position, row in enumerate(counted, start=1):
        record = {
            "record_id": f"shotsheet:{date}:{_as_int(row.get('excel_row'))}",
            "shot_number": position,
            "shot_date": date,
            "labfrog_date_time": _row_time(date, row),
            "campaign": experiment_id,
            "experiment_id": experiment_id,
            "record_source": SHOTSHEET_SOURCE,
            "metadata": _row_metadata(row),
        }
        count = _as_int(row.get("count"))
        if count is not None:
            record["local_count"] = count
        shots.append(record)
    return shots


def _catalogue_by_folder() -> dict[str, dict[str, Any]]:
    """The vendored instrument catalogue, by folder alias and name (lower case)."""
    from .hzdr_packs import vendor

    found: dict[str, dict[str, Any]] = {}
    for instrument_id, entry in vendor.catalogue().items():
        for name in [*(entry.get("folder_aliases") or []), entry.get("display_name")]:
            if name:
                found.setdefault(str(name).lower(), {**entry, "id": instrument_id})
    return found


def _instrument(folder: str, catalogue: dict[str, dict[str, Any]]) -> dict[str, Any]:
    entry = catalogue.get(folder.lower())
    if entry is None or not entry.get("format") or entry["format"] == "unrecognised":
        return {"id": None, "record_source": "none"}
    instrument = {
        "id": entry["id"],
        "format": entry["format"],
        "record_source": "catalogue",
    }
    for key in ("group", "timing_role"):
        if entry.get(key):
            instrument[key] = entry[key]
    return instrument


def _utc_iso(epoch: float) -> str:
    from datetime import UTC, datetime

    return datetime.fromtimestamp(epoch, UTC).isoformat()


def _acquisition_epoch(
    acquisition: dict[str, Any], event: dict[str, Any], timezone: str
) -> float | None:
    """The instrument's raw time; else its local ``iso``; else the event's."""
    from .hzdr_nexus import parse_datetime

    if isinstance(acquisition.get("timestamp"), (int, float)):
        return float(acquisition["timestamp"])
    stamp = parse_datetime(acquisition.get("iso"), naive_timezone=timezone)
    if stamp is not None:
        return stamp.timestamp()
    if isinstance(event.get("time"), (int, float)):
        return float(event["time"])
    return None


def acquisition_events(
    index: dict[str, Any], experiment_id: str, *, timezone: str = "Europe/Berlin"
) -> list[dict[str, Any]]:
    """Every shot acquisition of the day as one ``hzdr-event-v1`` file event (F4).

    The files are named under the index's ``dataFolder``; the instrument comes
    from the vendored catalogue by folder name. No shot number and no
    attribution: the bridge attaches them by file. Auxiliary files get none.
    """
    import hashlib

    date_folder = str(index.get("date") or "")
    data_folder = str(index.get("dataFolder") or "").rstrip("/")
    if not _DATE_FOLDER.match(date_folder) or not data_folder:
        return []
    catalogue = _catalogue_by_folder()
    events: list[dict[str, Any]] = []
    for data in (index.get("sets") or {}).values():
        for event in (data.get("events") or []) if isinstance(data, dict) else []:
            for acquisition in event.get("acquisitions") or []:
                files = [
                    str(name).replace("\\", "/")
                    for name in acquisition.get("files") or []
                ]
                if not files:
                    continue
                epoch = _acquisition_epoch(acquisition, event, timezone)
                if epoch is None:
                    continue
                folder = PurePosixPath(files[0]).parts[0]
                digest = hashlib.sha256(
                    f"{date_folder}|{acquisition.get('key')}".encode()
                ).hexdigest()[:24]
                primary = next(
                    (
                        name
                        for name in files
                        if name.endswith(("_original.png", ".txt", ".tif"))
                    ),
                    files[0],
                )
                acquisition_meta: dict[str, Any] = {"time": _utc_iso(epoch)}
                source = str(acquisition.get("timeSource") or "")
                if source in _TIME_SOURCES:
                    acquisition_meta["time_source"] = source
                events.append({
                    "schema_version": "hzdr-event-v1",
                    "event_id": f"aligner-{digest}",
                    "experiment_id": experiment_id,
                    "shot_id": f"{date_folder}:{acquisition.get('key')}",
                    "shot_number": None,
                    "source": ALIGNER_EVENT_SOURCE,
                    "kind": ALIGNER_EVENT_KIND,
                    "timestamp": _utc_iso(epoch),
                    "transport": "file",
                    "payload_ref": {
                        "path": f"{data_folder}/{primary}",
                        "filename": PurePosixPath(primary).name,
                        "members": [
                            {
                                "path": f"{data_folder}/{name}",
                                "filename": PurePosixPath(name).name,
                            }
                            for name in files
                        ],
                    },
                    "values": None,
                    "metadata": {
                        "instrument": _instrument(folder, catalogue),
                        "acquisition": acquisition_meta,
                        # Its own stream per folder, also for an uncatalogued one (D1).
                        "producer": {"instance_id": f"shot-aligner:{folder}"},
                        "watch": {
                            "watch_name": folder,
                            "watch_path": f"{data_folder}/{folder}",
                        },
                    },
                })
    return events


def backfill(
    index_dir: Path,
    experiment_id: str,
    date_folders: list[str],
    *,
    labfrog_shots: list[dict[str, Any]],
    events: list[dict[str, Any]],
    timezone: str = "Europe/Berlin",
    cache_dir: Path | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Shotsheet shots for the dates LabFrog has none of, and the days' files.

    F2: a date with LabFrog records keeps them. F4: a file a producer event
    already names keeps that event. Returns (shots to add, events to add).
    """
    from .hzdr_nexus import parse_datetime, resolve_timezone

    labfrog_dates = {str(shot.get("shot_date")) for shot in labfrog_shots}
    zone = resolve_timezone(timezone)
    # (folder, name, date folder) of every file a producer event names: a
    # spectrometer's plain names repeat from day to day, so the day counts.
    produced: set[tuple[str, str, str]] = set()
    for event in events:
        stamp = parse_datetime(event.get("timestamp"))
        local = stamp.astimezone(zone).strftime("%Y_%m_%d") if stamp else ""
        for folder, name, parts in event_file_keys(event):
            days = [part for part in parts if _DATE_FOLDER.match(part)] or [local]
            produced.update((folder, name, day) for day in days)
    shots: list[dict[str, Any]] = []
    added: list[dict[str, Any]] = []
    for date_folder in date_folders:
        day = load_day_data(
            index_dir, date_folder, cache_dir=cache_dir, timezone=timezone
        )
        if day is None:
            continue
        if date_folder.replace("_", "-") not in labfrog_dates:
            shots.extend(day.shots_for(experiment_id))
        for event in day.events_for(experiment_id):
            keys = {
                (folder, name, date_folder)
                for folder, name, _ in event_file_keys(event)
            }
            if not keys & produced:
                added.append(event)
    return shots, added


# --- the stored, parsed day (plan-backfill-store-and-console G1) ----------------

#: Bump when what a stored day holds changes; an older file is then re-parsed.
CACHE_VERSION = 2  # 2: confirmation judged by the ledger's witness
CACHE_SUFFIX = ".aligner.json"
CACHE_DIRNAME = ".aligner-cache"


@dataclass
class DayData:
    """One day, parsed: the bridge's claims, the Shotsheet shots, the files.

    The shots and events are kept without a campaign; ``shots_for`` and
    ``events_for`` stamp one in.
    """

    claims: dict[FileKey, AlignerClaim]
    shots: list[dict[str, Any]]
    events: list[dict[str, Any]]
    from_cache: bool = False

    def shots_for(self, experiment_id: str) -> list[dict[str, Any]]:
        return [
            {**shot, "campaign": experiment_id, "experiment_id": experiment_id}
            for shot in self.shots
        ]

    def events_for(self, experiment_id: str) -> list[dict[str, Any]]:
        return [{**event, "experiment_id": experiment_id} for event in self.events]


def _stat(path: Path) -> list[int] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return [stat.st_size, stat.st_mtime_ns]


def day_fingerprint(index_dir: Path, date_folder: str, timezone: str) -> dict[str, Any]:
    """What a stored day was made from: both files' size and mtime, the zone."""
    return {
        "version": CACHE_VERSION,
        "index": _stat(index_dir / f"{date_folder}{INDEX_SUFFIX}"),
        "decisions": _stat(index_dir / f"{date_folder}{DECISIONS_SUFFIX}"),
        "timezone": timezone,
    }


def _claims_to_json(claims: dict[FileKey, AlignerClaim]) -> list[dict[str, Any]]:
    """One entry per claim object, with every file key that names it."""
    grouped: dict[int, dict[str, Any]] = {}
    for key, claim in claims.items():
        entry = grouped.setdefault(
            id(claim), {"claim": dataclasses.asdict(claim), "keys": []}
        )
        entry["keys"].append(list(key))
    return list(grouped.values())


def _claims_from_json(entries: list[dict[str, Any]]) -> dict[FileKey, AlignerClaim]:
    claims: dict[FileKey, AlignerClaim] = {}
    for entry in entries:
        claim = AlignerClaim(**entry["claim"])
        for key in entry["keys"]:
            claims[str(key[0]), str(key[1]), str(key[2])] = claim
    return claims


def _read_cached(path: Path, fingerprint: dict[str, Any]) -> DayData | None:
    data = _read_json(path) if path.is_file() else None
    if not data or data.get("fingerprint") != fingerprint:
        return None
    try:
        return DayData(
            claims=_claims_from_json(data["claims"]),
            shots=list(data["shots"]),
            events=list(data["events"]),
            from_cache=True,
        )
    except (KeyError, TypeError, ValueError) as error:
        logger.warning("stored shot-aligner day %s not used: %s", path, error)
        return None


def _write_cached(path: Path, fingerprint: dict[str, Any], day: DayData) -> None:
    """Write atomically (temp file, rename): a killed build leaves no half file."""
    payload = {
        "fingerprint": fingerprint,
        "claims": _claims_to_json(day.claims),
        "shots": day.shots,
        "events": day.events,
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
        temporary.write_text(json.dumps(payload), encoding="utf-8")
        Path(temporary).replace(path)
    except OSError as error:  # a cache that cannot be written only costs time
        logger.warning("shot-aligner day %s not stored: %s", path, error)


def load_day_data(
    index_dir: Path,
    date_folder: str,
    *,
    cache_dir: Path | None = None,
    timezone: str = "Europe/Berlin",
) -> DayData | None:
    """One day parsed, from ``cache_dir`` while shot-aligner has not changed it.

    The stored form is used only when its fingerprint (size and mtime of the
    index and the decisions, the zone, ``CACHE_VERSION``) matches; else the
    index is parsed again and stored. None when the day has no index.
    """
    fingerprint = day_fingerprint(index_dir, date_folder, timezone)
    if fingerprint["index"] is None:
        logger.warning(
            "shot-aligner has no day index for %s in %s", date_folder, index_dir
        )
        return None
    cached_path = cache_dir / f"{date_folder}{CACHE_SUFFIX}" if cache_dir else None
    if cached_path is not None:
        cached = _read_cached(cached_path, fingerprint)
        if cached is not None:
            return cached
    day = load_day(index_dir, date_folder)
    if day is None:
        return None
    index, decisions = day
    parsed = DayData(
        claims=claims_from_index(
            index, decisions, index_file=str(index_dir / f"{date_folder}{INDEX_SUFFIX}")
        ),
        shots=shotsheet_shots(index, ""),
        events=acquisition_events(index, "", timezone=timezone),
    )
    if cached_path is not None:
        _write_cached(cached_path, fingerprint, parsed)
    return parsed


def local_dates(events: list[dict[str, Any]], timezone: str) -> set[str]:
    """The campaign-local dates (ISO) the events fall on (G3)."""
    from .hzdr_nexus import parse_datetime, resolve_timezone

    zone = resolve_timezone(timezone)
    return {
        stamp.astimezone(zone).date().isoformat()
        for event in events
        if (stamp := parse_datetime(event.get("timestamp"))) is not None
    }
