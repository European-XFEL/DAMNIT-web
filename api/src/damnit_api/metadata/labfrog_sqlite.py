"""Read-only reader for curated LabFrog campaign SQLite snapshots.

The sibling ``labfrog-sqlite-tools`` repo exports one SQLite file per campaign to
``curated_files/<Campaign>/<Campaign>.sqlite``.  Each file carries an
``export_metadata`` table (campaign source, ``row_count``, ``exported_at``) and a
``shot_summary`` view of the shot records.  That repo owns the Mongo -> SQLite
extraction; DAMNIT-web only *reads* the produced files, so this module never
opens Mongo and never writes (every connection uses a ``mode=ro`` URI).

This gives the Link Records page an authoritative list of unique campaigns plus
real per-shot records, without DAMNIT-web needing any database access.
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from pydantic import BaseModel

log = logging.getLogger(__name__)

# Columns surfaced from shot_summary for the Link Records preview. Kept to the
# stable, campaign-agnostic columns - per-diagnostic columns vary by campaign.
_SHOT_PREVIEW_COLUMNS = (
    "shot_id",
    "day_shot_key",
    "shot_number",
    "date_time",
    "shot_date",
    "campaign",
    "target",
    "status",
)


class LabFrogCampaignRef(BaseModel):
    """One curated campaign snapshot discovered on disk."""

    key: str
    title: str
    sqlite_path: Path
    source_database: str | None = None
    source_collection: str | None = None
    row_count: int | None = None
    exported_at: str | None = None
    shot_date_min: str | None = None
    shot_date_max: str | None = None


class LabFrogCampaignShot(BaseModel):
    """One shot record previewed from a campaign's shot_summary view."""

    shot_id: str | None = None
    day_shot_key: str | None = None
    shot_number: int | None = None
    date_time: str | None = None
    shot_date: str | None = None
    campaign: str | None = None
    target: str | None = None
    status: str | None = None


def _connect_readonly(path: Path) -> sqlite3.Connection:
    """Open a SQLite file strictly read-only via a file: URI."""
    uri = f"file:{path}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def _has_object(connection: sqlite3.Connection, name: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE name = ? LIMIT 1", (name,)
    ).fetchone()
    return row is not None


def _curated_sqlite_files(curated_dir: Path) -> list[Path]:
    """Return campaign SQLite files under a curated_files directory."""
    return sorted(curated_dir.glob("*/*.sqlite"))


def list_campaigns(curated_dir: Path | None) -> list[LabFrogCampaignRef]:
    """List curated campaigns found under a labfrog curated_files directory.

    Returns an empty list when the directory is unset or missing - a safe,
    offline default matching how the file source provider treats a missing
    sources_file.  Files lacking the expected tables are skipped, not fatal.
    """
    if curated_dir is None or not curated_dir.is_dir():
        return []

    campaigns: list[LabFrogCampaignRef] = []
    for sqlite_path in _curated_sqlite_files(curated_dir):
        campaign = _read_campaign_ref(sqlite_path)
        if campaign is not None:
            campaigns.append(campaign)
    return campaigns


def _read_campaign_ref(sqlite_path: Path) -> LabFrogCampaignRef | None:
    key = sqlite_path.stem
    try:
        with _connect_readonly(sqlite_path) as connection:
            if not _has_object(connection, "shot_summary"):
                return None
            metadata = _read_export_metadata(connection)
            title = _read_campaign_title(connection) or key
            date_min, date_max = _read_shot_date_range(connection)
    except sqlite3.Error as exc:
        log.warning("Skipping unreadable curated campaign %s: %s", sqlite_path, exc)
        return None

    row_count = metadata.get("row_count")
    return LabFrogCampaignRef(
        key=key,
        title=title,
        sqlite_path=sqlite_path,
        source_database=metadata.get("database"),
        source_collection=metadata.get("collection"),
        row_count=int(row_count) if row_count and row_count.isdigit() else None,
        exported_at=metadata.get("exported_at"),
        shot_date_min=date_min,
        shot_date_max=date_max,
    )


def _read_export_metadata(connection: sqlite3.Connection) -> dict[str, str]:
    if not _has_object(connection, "export_metadata"):
        return {}
    return {
        str(row["key"]): str(row["value"])
        for row in connection.execute("SELECT key, value FROM export_metadata")
    }


def _read_campaign_title(connection: sqlite3.Connection) -> str | None:
    row = connection.execute(
        "SELECT campaign FROM shot_summary "
        "WHERE campaign IS NOT NULL AND campaign != '' LIMIT 1"
    ).fetchone()
    return str(row["campaign"]) if row and row["campaign"] else None


def _read_shot_date_range(
    connection: sqlite3.Connection,
) -> tuple[str | None, str | None]:
    row = connection.execute(
        "SELECT MIN(shot_date) AS lo, MAX(shot_date) AS hi FROM shot_summary"
    ).fetchone()
    if row is None:
        return None, None
    lo = str(row["lo"]) if row["lo"] else None
    hi = str(row["hi"]) if row["hi"] else None
    return lo, hi


def list_campaign_shots(
    curated_dir: Path | None, campaign_key: str, limit: int = 200
) -> list[LabFrogCampaignShot]:
    """Preview shot records for one curated campaign by its file-stem key."""
    if curated_dir is None or not curated_dir.is_dir():
        return []

    sqlite_path = next(
        (
            path
            for path in _curated_sqlite_files(curated_dir)
            if path.stem == campaign_key
        ),
        None,
    )
    if sqlite_path is None:
        return []

    columns = ", ".join(_SHOT_PREVIEW_COLUMNS)
    safe_limit = max(1, min(int(limit), 1000))
    try:
        with _connect_readonly(sqlite_path) as connection:
            if not _has_object(connection, "shot_summary"):
                return []
            rows = connection.execute(
                # columns is a join of the hardcoded _SHOT_PREVIEW_COLUMNS
                # constant (never user input); the limit is bound as a param.
                f"SELECT {columns} FROM shot_summary "  # noqa: S608
                "ORDER BY shot_date, shot_number LIMIT ?",
                (safe_limit,),
            ).fetchall()
    except sqlite3.Error as exc:
        log.warning("Failed reading shots for campaign %s: %s", campaign_key, exc)
        return []

    return [LabFrogCampaignShot(**dict(row)) for row in rows]
