import sqlite3
from pathlib import Path

from damnit_api.metadata.labfrog_sqlite import (
    list_campaign_shots,
    list_campaigns,
)


def write_curated_campaign(curated_dir: Path, key: str, campaign: str) -> Path:
    """Write a minimal curated campaign SQLite mirroring labfrog-sqlite-tools."""
    folder = curated_dir / key
    folder.mkdir(parents=True)
    path = folder / f"{key}.sqlite"
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE export_metadata (key TEXT, value TEXT);
        CREATE TABLE shot_summary (
            shot_id TEXT, day_shot_key TEXT, shot_number INTEGER,
            date_time TEXT, shot_date TEXT, campaign TEXT,
            target TEXT, status TEXT
        );
        """
    )
    con.executemany(
        "INSERT INTO export_metadata (key, value) VALUES (?, ?)",
        [
            ("row_count", "2"),
            ("exported_at", "2026-06-10T12:14:55+00:00"),
            ("database", "fwktExperiments"),
            ("collection", "shots"),
        ],
    )
    con.executemany(
        "INSERT INTO shot_summary "
        "(shot_id, day_shot_key, shot_number, date_time, shot_date, "
        "campaign, target, status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (
                "a1",
                "Day 1 - Shot 1",
                1,
                "2026-04-21 11:04:53",
                "2026-04-21",
                campaign,
                "T1",
                "ok",
            ),
            (
                "a2",
                "Day 2 - Shot 1",
                2,
                "2026-04-22 09:00:00",
                "2026-04-22",
                campaign,
                "T2",
                "review",
            ),
        ],
    )
    con.commit()
    con.close()
    return path


def test_list_campaigns_reads_curated_snapshot(tmp_path: Path):
    curated = tmp_path / "curated_files"
    write_curated_campaign(curated, "Beamline_radbio_2026", "Beamline radbio 2026")

    campaigns = list_campaigns(curated)

    assert len(campaigns) == 1
    campaign = campaigns[0]
    assert campaign.key == "Beamline_radbio_2026"
    assert campaign.title == "Beamline radbio 2026"
    assert campaign.row_count == 2
    assert campaign.source_collection == "shots"
    assert campaign.shot_date_min == "2026-04-21"
    assert campaign.shot_date_max == "2026-04-22"


def test_list_campaign_shots_returns_preview_rows(tmp_path: Path):
    curated = tmp_path / "curated_files"
    write_curated_campaign(curated, "camp", "Camp")

    shots = list_campaign_shots(curated, "camp", limit=10)

    assert [shot.shot_number for shot in shots] == [1, 2]
    assert shots[0].day_shot_key == "Day 1 - Shot 1"
    assert shots[1].status == "review"


def test_missing_or_unset_dir_returns_empty(tmp_path: Path):
    assert list_campaigns(None) == []
    assert list_campaigns(tmp_path / "does-not-exist") == []
    assert list_campaign_shots(None, "camp") == []


def test_unknown_campaign_key_returns_empty(tmp_path: Path):
    curated = tmp_path / "curated_files"
    write_curated_campaign(curated, "camp", "Camp")

    assert list_campaign_shots(curated, "other") == []


def test_file_without_shot_summary_is_skipped(tmp_path: Path):
    curated = tmp_path / "curated_files"
    folder = curated / "broken"
    folder.mkdir(parents=True)
    con = sqlite3.connect(folder / "broken.sqlite")
    con.execute("CREATE TABLE export_metadata (key TEXT, value TEXT)")
    con.commit()
    con.close()

    assert list_campaigns(curated) == []
