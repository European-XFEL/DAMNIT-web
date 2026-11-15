"""Superseded LabFrog versions in the canonical NeXus file.

The case is the constellation emulator's E13: the operator types 44 into
LabFrog for the shot the authority numbered 4, an export goes out, and the
record is then corrected (a new version; the old one is archived).
"""

import contextlib
import sqlite3
from pathlib import Path

import h5py

from damnit_api.metadata.hzdr_nexus import (
    read_labfrog_sqlite_shots,
    reconcile_canonical_shots,
    write_nexus_bridge,
)

CAMPAIGN = "C"


def write_export(path: Path, *, corrected: bool, links: bool = True) -> None:
    """A LabFrog export with a typed shot number, before or after its correction."""
    rows = [
        ("one", 3, "2026-11-14T10:00:00Z", "active", 0, 3),
        ("typo", 44, "2026-11-14T10:01:00Z", "active", 0, 4),
    ]
    if corrected:
        rows[1] = ("typo", 44, "2026-11-14T10:01:00Z", "archived", 0, 4)
        rows.append(("fixed", 4, "2026-11-14T10:01:00Z", "active", 1, 4))
    with contextlib.closing(sqlite3.connect(path)) as connection, connection:
        connection.execute(
            "CREATE TABLE shots (mongo_id TEXT PRIMARY KEY, shot_number INTEGER, "
            "date_time TEXT, campaign TEXT, mode TEXT, status TEXT, version INTEGER, "
            "authority_shot_number INTEGER, filler TEXT)"
        )
        connection.executemany(
            "INSERT INTO shots VALUES (?, ?, ?, ?, 'shot', ?, ?, ?, ?)",
            [(*row[:3], CAMPAIGN, *row[3:], "x" * 600) for row in rows],
        )
        if links:
            connection.execute(
                "CREATE TABLE shot_version_links (id INTEGER PRIMARY KEY, "
                "shot_id TEXT NOT NULL, shot_number INTEGER, previous_shot_id TEXT, "
                "previous_shot_number INTEGER, link_field TEXT NOT NULL, "
                "link_value TEXT NOT NULL, "
                "link_kind TEXT NOT NULL DEFAULT 'previous_version')"
            )
            if corrected:
                connection.execute(
                    "INSERT INTO shot_version_links (shot_id, shot_number, "
                    "previous_shot_id, link_field, link_value) "
                    "VALUES ('fixed', 4, 'typo', '_id_OLD', 'typo')"
                )


def trigger(number: int, minute: int) -> dict:
    return {
        "event_id": f"trigger-{number}",
        "experiment_id": CAMPAIGN,
        "shot_id": f"shot-{number:06d}",
        "shot_number": number,
        "source": "DRACO-Trigger",
        "kind": "draco.trigger",
        "timestamp": f"2026-11-14T10:{minute:02d}:00Z",
        "transport": "kafka",
        "payload_ref": {"topic": "t", "partition": 0, "offset": number},
        "metadata": {},
    }


def build(tmp_path: Path, *, corrected: bool, links: bool = True) -> Path:
    export = tmp_path / f"export-{corrected}-{links}.sqlite"
    write_export(export, corrected=corrected, links=links)
    shots, events = reconcile_canonical_shots(
        [trigger(3, 0), trigger(4, 1)],
        experiment_id=CAMPAIGN,
        source_key=CAMPAIGN,
        labfrog_shots=read_labfrog_sqlite_shots(export),
    )
    output = tmp_path / "campaign.nxs"
    write_nexus_bridge(
        output_path=output, experiment_id=CAMPAIGN, shots=shots, events=events
    )
    return output


def column(handle: h5py.File, path: str) -> list:
    dataset = handle[path]
    if h5py.check_string_dtype(dataset.dtype) is not None:
        return list(dataset.asstr()[...])
    return [int(value) for value in dataset[...]]


def labfrog_rows(handle: h5py.File) -> list[str]:
    """The record ids of the LabFrog rows in /entry/source_events."""
    sources = column(handle, "entry/source_events/source")
    refs = column(handle, "entry/source_events/payload_ref_json")
    return sorted(
        ref.split('"record_id": "')[1].split('"')[0]
        for source, ref in zip(sources, refs, strict=True)
        if source == "LabFrog"
    )


def test_before_the_correction_the_typed_number_is_the_shot_beside_the_authority(
    tmp_path: Path,
):
    with h5py.File(build(tmp_path, corrected=False), "r") as handle:
        assert column(handle, "entry/shots/shot_number") == [3, 44]
        assert column(handle, "entry/shots/authority_shot_number") == [3, 4]
        assert column(handle, "entry/shots/shot_key")[1].endswith(":000044")
        keys = dict(
            zip(
                column(handle, "entry/source_events/event_id"),
                column(handle, "entry/source_events/shot_key"),
                strict=True,
            )
        )
        # The authority's trigger 4 found the record typed 44.
        assert keys["trigger-4"].endswith(":000044")
        assert labfrog_rows(handle) == ["one", "typo"]


def test_v6_keeps_a_superseded_version_in_the_shot_and_event_tables(tmp_path: Path):
    """Characterization of bridge profile v6, before the history group."""
    with h5py.File(build(tmp_path, corrected=True), "r") as handle:
        assert column(handle, "entry/shots/record_id") == ["one", "fixed", "typo"]
        assert column(handle, "entry/shots/shot_number") == [3, 4, 44]
        assert column(handle, "entry/shots/authority_shot_number") == [3, 4, 4]
        assert labfrog_rows(handle) == ["fixed", "one", "typo"]
        assert "labfrog_history" not in handle["entry"]
