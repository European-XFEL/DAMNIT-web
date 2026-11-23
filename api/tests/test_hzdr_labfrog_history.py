"""Superseded LabFrog versions in the canonical NeXus file.

The case is the constellation emulator's E13: the operator types 44 into
LabFrog for the shot the authority numbered 4, an export goes out, and the
record is then corrected (a new version; the old one is archived).
"""

import contextlib
import json
import sqlite3
from pathlib import Path
from typing import cast

import h5py

from damnit_api.metadata.hzdr_nexus import (
    _mark_superseded_labfrog_rows,
    read_labfrog_nexus_shots,
    read_labfrog_sqlite_shots,
    reconcile_canonical_shots,
    split_labfrog_history,
    write_nexus_bridge,
    write_sources_catalog,
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


def dataset_at(handle: h5py.File, path: str) -> h5py.Dataset:
    return cast("h5py.Dataset", handle[path])


def column(handle: h5py.File, path: str) -> list:
    dataset = dataset_at(handle, path)
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


def test_a_superseded_version_leaves_the_shot_and_event_tables(tmp_path: Path):
    """Bridge profile v7: history is reachable, not mixed in."""
    with h5py.File(build(tmp_path, corrected=True), "r") as handle:
        assert handle.attrs["damnit_bridge_profile"] == "hzdr-canonical-shot-v8"
        assert column(handle, "entry/shots/record_id") == ["one", "fixed"]
        assert column(handle, "entry/shots/shot_index") == [0, 1]
        assert column(handle, "entry/shots/shot_number") == [3, 4]
        assert column(handle, "entry/shots/authority_shot_number") == [3, 4]
        assert labfrog_rows(handle) == ["fixed", "one"]
        events = column(handle, "entry/source_events/event_id")
        assert column(handle, "entry/source_events/event_index") == list(
            range(len(events))
        )
        assert {"trigger-3", "trigger-4"} <= set(events)
        assert not any(
            key.endswith(":000044")
            for key in column(handle, "entry/source_events/shot_key")
        )

        assert handle["entry/labfrog_history"].attrs["NX_class"] == "NXcollection"
        assert column(handle, "entry/labfrog_history/history_index") == [0]
        assert column(handle, "entry/labfrog_history/record_id") == ["typo"]
        assert column(handle, "entry/labfrog_history/shot_number") == [44]
        assert column(handle, "entry/labfrog_history/authority_shot_number") == [4]
        assert column(handle, "entry/labfrog_history/superseded_by") == ["fixed"]
        authority = dataset_at(handle, "entry/labfrog_history/authority_shot_number")
        assert authority.attrs["missing_value"] == -1


def test_the_history_group_is_written_empty_when_nothing_was_superseded(
    tmp_path: Path,
):
    with h5py.File(build(tmp_path, corrected=False), "r") as handle:
        assert handle["entry/labfrog_history"].attrs["NX_class"] == "NXcollection"
        for name in (
            "history_index",
            "record_id",
            "shot_number",
            "authority_shot_number",
            "superseded_by",
        ):
            assert dataset_at(handle, f"entry/labfrog_history/{name}").shape == (0,)
        record_id = dataset_at(handle, "entry/labfrog_history/record_id")
        assert h5py.check_string_dtype(record_id.dtype) is not None


def test_a_rebuild_on_the_corrected_export_replaces_the_earlier_file(tmp_path: Path):
    """The emulator's order: the export with the typo, then the corrected one."""
    build(tmp_path, corrected=False)
    with h5py.File(build(tmp_path, corrected=True), "r") as handle:
        assert column(handle, "entry/shots/shot_number") == [3, 4]
        assert column(handle, "entry/labfrog_history/shot_number") == [44]


def test_superseded_by_is_empty_when_the_export_names_no_newer_version(
    tmp_path: Path,
):
    """A changed number without a version link: nothing says which replaced it."""
    with h5py.File(build(tmp_path, corrected=True, links=False), "r") as handle:
        assert column(handle, "entry/labfrog_history/record_id") == ["typo"]
        assert column(handle, "entry/labfrog_history/superseded_by") == [""]


def test_an_edit_that_keeps_the_number_names_the_active_version(tmp_path: Path):
    """No link table: the one active row of the same day and number replaced it."""
    rows = [
        {
            "record_id": record_id,
            "shot_number": 17,
            "authority_shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:10Z",
            "campaign": CAMPAIGN,
            "metadata": {"status": status},
        }
        for record_id, status in (("old", "archived"), ("current", "active"))
    ]
    _mark_superseded_labfrog_rows(rows)
    shots, events = reconcile_canonical_shots(
        [], experiment_id=CAMPAIGN, source_key=CAMPAIGN, labfrog_shots=rows
    )
    history, current, current_events = split_labfrog_history(shots, events)

    assert [shot["labfrog_record_id"] for shot in history] == ["old"]
    assert history[0]["labfrog_superseded_by"] == "current"
    # The two versions share one shot_key: they are told apart as records.
    assert history[0]["shot_key"] == current[0]["shot_key"]
    assert [shot["labfrog_record_id"] for shot in current] == ["current"]
    assert [event["payload_ref"]["record_id"] for event in current_events] == [
        "current"
    ]
    # The lists the catalog writer gets are untouched.
    assert len(shots) == 2
    assert len(events) == 2


def test_the_catalog_lists_the_corrected_shot_only(tmp_path: Path):
    export = tmp_path / "export.sqlite"
    write_export(export, corrected=True)
    shots, events = reconcile_canonical_shots(
        [trigger(3, 0), trigger(4, 1)],
        experiment_id=CAMPAIGN,
        source_key=CAMPAIGN,
        labfrog_shots=read_labfrog_sqlite_shots(export),
    )
    catalog = tmp_path / "hzdr_sources.json"
    write_sources_catalog(
        sources_file=catalog,
        source_key=CAMPAIGN,
        experiment_id=CAMPAIGN,
        nexus_path=tmp_path / "campaign.nxs",
        shots=shots,
        events=events,
    )
    source = json.loads(catalog.read_text(encoding="utf-8"))["sources"][0]

    assert [shot["shot_number"] for shot in source["shots"]] == [3, 4]
    assert source["metadata"]["integration_profile"] == "hzdr-canonical-shot-v8"


def test_a_preserved_labfrog_table_keeps_its_rows_and_loses_the_event(
    tmp_path: Path,
):
    """A LabFrog NeXus shot table is LabFrog's: its history rows stay, marked."""
    source = tmp_path / "labfrog.nxs"
    string = h5py.string_dtype(encoding="utf-8")
    with h5py.File(source, "w") as handle:
        group = handle.create_group("entry/shots")
        group.create_dataset("record_index", data=[0, 1])
        group.create_dataset("record_id", data=["typo", "fixed"], dtype=string)
        group.create_dataset("shot_number", data=[44, 4])
        group.create_dataset("authority_shot_number", data=[4, 4])
        group.create_dataset(
            "date_time", data=["2026-11-14T10:01:00Z"] * 2, dtype=string
        )
        group.create_dataset("has_newer_version", data=[True, False])
    shots, events = reconcile_canonical_shots(
        [trigger(4, 1)],
        experiment_id=CAMPAIGN,
        source_key=CAMPAIGN,
        labfrog_shots=read_labfrog_nexus_shots(source),
    )
    output = tmp_path / "campaign.nxs"
    write_nexus_bridge(
        output_path=output,
        experiment_id=CAMPAIGN,
        shots=shots,
        events=events,
        source_nexus=source,
    )

    with h5py.File(output, "r") as handle:
        assert column(handle, "entry/shots/shot_number") == [44, 4]
        marks = dataset_at(handle, "entry/shots/has_newer_version")[...]
        assert [bool(mark) for mark in marks] == [True, False]
        assert labfrog_rows(handle) == ["fixed"]
        assert column(handle, "entry/labfrog_history/record_id") == ["typo"]
        assert column(handle, "entry/labfrog_history/shot_number") == [44]
        assert column(handle, "entry/labfrog_history/superseded_by") == [""]
