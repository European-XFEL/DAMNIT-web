import argparse
import importlib.util
import json
import sqlite3
import sys
from pathlib import Path
from typing import cast

import h5py
import numpy as np

from damnit_api.metadata.hzdr_sources import (
    HZDRSourceProvider,
    preview_hdf5_dataset,
)
from damnit_api.shared.settings import MetadataSettings

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "hzdr-hdf5-builder.py"
SPEC = importlib.util.spec_from_file_location("hzdr_hdf5_builder", SCRIPT_PATH)
assert SPEC is not None
hzdr_hdf5_builder = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["hzdr_hdf5_builder"] = hzdr_hdf5_builder
SPEC.loader.exec_module(hzdr_hdf5_builder)

EXPERIMENT_ID = "Solenoid_Beamline_Tests_01.2025"
SOURCE_KEY = "hzdr-solenoid-beamline-tests-01-2025"


def write_labfrog_export(path: Path) -> None:
    string_dtype = h5py.string_dtype(encoding="utf-8")
    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        shots = entry.create_group("shots")
        shots.create_dataset("shot_index", data=[0, 1])
        shots.create_dataset(
            "record_id",
            data=np.asarray(["mongo-day-one", "mongo-day-two"], dtype=string_dtype),
        )
        shots.create_dataset("shot_number", data=[1, 1])
        shots.create_dataset("authority_shot_number", data=[1, 1])
        shots.create_dataset(
            "shot_date",
            data=np.asarray(["2025-01-15", "2025-01-16"], dtype=string_dtype),
        )
        shots.create_dataset(
            "date_time",
            data=np.asarray(
                ["2025-01-15T09:00:00", "2025-01-16T09:00:00"],
                dtype=string_dtype,
            ),
        )
        shots.create_dataset(
            "campaign",
            data=np.asarray([EXPERIMENT_ID, EXPERIMENT_ID], dtype=string_dtype),
        )
        derived = entry.create_group("derived")
        charge = derived.create_dataset("ict_charge", data=[1.1, 1.2])
        charge.attrs["units"] = "nC"


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_offline_pipeline_combines_labfrog_asapo_watchdog_and_draco(tmp_path: Path):
    labfrog_nexus = tmp_path / "labfrog.nxs"
    asapo_event = tmp_path / "asapo.json"
    watchdog_event = tmp_path / "watchdog.jsonl"
    trigger_event = tmp_path / "trigger.jsonl"
    output_nexus = tmp_path / "canonical.nxs"
    sources_file = tmp_path / "hzdr_sources.json"
    write_labfrog_export(labfrog_nexus)

    write_json(
        asapo_event,
        {
            "experiment_id": EXPERIMENT_ID,
            "shot_id": "shot-000001",
            "shot_number": 1,
            "source": "LaserData",
            "kind": "camera_raw",
            "timestamp": "2025-01-16T08:00:00Z",
            "transport": "asapo",
            "payload_ref": {"stream": "laser", "message_id": 101},
            "values": [[1.0, 2.0], [3.0, 4.0]],
            "metadata": {"unit": "count"},
        },
    )
    write_json(
        watchdog_event,
        {
            "watch": {"watch_name": "TPS results"},
            "event": {
                "filename": "shot-1.csv",
                "filepath": "Z:/data/shot-1.csv",
                "timestamp": "2025-01-16T08:00:01Z",
            },
            "analysis": {"data": {"shot": 1, "energy": 8.2}},
            "_kafka": {"topic": "planet-watchdog-events", "partition": 0, "offset": 42},
        },
    )
    write_json(
        trigger_event,
        {
            "processed_message": {
                # Field names match what GitLab/shotcounter's
                # feature/hzdr-canonical-trigger-event branch actually emits
                # (snake_case, except Name/Campaign which are kept unrenamed
                # by design - see hzdr/docs/status/integration-roadmap.md).
                "Name": "Draco01",
                "Campaign": EXPERIMENT_ID,
                "nickname": "trigger_shot_solenoid",
                "trigger_role": "pump",
                "threshold": 0.25,
                "adc_value": 0.81,
                "channel_trigger_count": 17,
                "run_id": 4,
                "timestamp": "2025-01-16T08:00:02Z",
                "sample_counter_10hz": 9012,
                # shot_number is shotcounter's device-local ShotNumber (see
                # resolveShotNumber), not the 10Hz counter.
                "shot_number": 1,
            },
            "_kafka": {
                "topic": "Draco01",
                "partition": 0,
                "offset": 43,
                "key": "processed_message",
            },
        },
    )

    args = argparse.Namespace(
        events_jsonl=[],
        event_json=[asapo_event],
        watchdog_jsonl=[watchdog_event],
        trigger_jsonl=[trigger_event],
        labfrog_nexus=labfrog_nexus,
        labfrog_sqlite=None,
        mongo_uri=None,
        mongo_database=None,
        mongo_collection=None,
        mongo_query_json="",
        experiment_id=EXPERIMENT_ID,
        source_key=SOURCE_KEY,
        output_nexus=output_nexus,
        sources_file=sources_file,
        match_tolerance_s=120.0,
        campaign_timezone="Europe/Berlin",
    )

    built_nexus, built_sources = hzdr_hdf5_builder.build(args)

    assert built_nexus == output_nexus.resolve()
    assert built_sources == sources_file.resolve()
    with h5py.File(built_nexus, "r") as handle:
        assert list(handle["entry/shots/shot_number"][...]) == [1, 1]  # pyright: ignore[reportArgumentType, reportIndexIssue]
        assert list(handle["entry/shots/shot_key"].asstr()[...]) == [  # pyright: ignore[reportAttributeAccessIssue]
            f"{EXPERIMENT_ID}:20250115:000001",
            f"{EXPERIMENT_ID}:20250116:000001",
        ]
        assert set(handle["entry/source_events/source"].asstr()[...]) == {  # pyright: ignore[reportAttributeAccessIssue]
            "DRACO-Trigger",
            "LabFrog",
            "LaserData",
            "DAQ-File-Watchdog",
        }
        assert "entry/laserdata/camera_raw" in handle
        assert "entry/derived/ict_charge" in handle

    provider = HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=built_sources)
    )
    source = provider.get_source(SOURCE_KEY)
    assert source is not None
    assert [shot.shot_date for shot in source.shots] == ["2025-01-15", "2025-01-16"]
    assert {event.source for event in source.shots[1].events} == {
        "DRACO-Trigger",
        "LabFrog",
        "LaserData",
        "DAQ-File-Watchdog",
    }
    assert {event.source for event in source.shots[0].events} == {"LabFrog"}
    # shot 0 (day one) has no external events at all - it's labfrog-only, not
    # matched or unmatched. Shot 1 (day two) is matched by all three producers.
    # No review needed either way.
    assert source.shots[0].match_status == "labfrog-only"
    assert source.shots[1].match_status == "matched"
    assert source.match_summary.matched == 1
    assert source.match_summary.ambiguous == 0
    assert source.match_summary.unmatched == 0
    assert source.review_events == []

    # planet-watchdog payload_ref must carry topic/partition/offset from _kafka
    watchdog_event_obj = next(
        e for e in source.shots[1].events if e.source == "DAQ-File-Watchdog"
    )
    assert watchdog_event_obj.payload_ref.topic == "planet-watchdog-events"
    assert watchdog_event_obj.payload_ref.partition == 0
    assert watchdog_event_obj.payload_ref.offset == 42

    camera_product = next(
        product
        for product in source.shots[1].data_products
        if product.source == "LaserData" and product.dataset_name
    )
    with h5py.File(built_nexus, "r") as handle:
        assert handle[camera_product.dataset_name][...].tolist() == [  # pyright: ignore[reportAttributeAccessIssue, reportIndexIssue]
            [1.0, 2.0],
            [3.0, 4.0],
        ]
    preview = preview_hdf5_dataset(built_nexus, camera_product.dataset_name)  # pyright: ignore[reportArgumentType]
    assert preview.preview_kind == "image"
    assert preview.preview == [[0.0, 1 / 3], [2 / 3, 1.0]]


def write_labfrog_export_with_duplicate_shot_number(path: Path) -> None:
    """Two equidistant LabFrog shots on the same day with the same
    shot_number must stay ambiguous rather than silently pick one."""
    string_dtype = h5py.string_dtype(encoding="utf-8")
    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        shots = entry.create_group("shots")
        shots.create_dataset("shot_index", data=[0, 1])
        shots.create_dataset(
            "record_id",
            data=np.asarray(["mongo-dup-a", "mongo-dup-b"], dtype=string_dtype),
        )
        shots.create_dataset("shot_number", data=[1, 1])
        shots.create_dataset("authority_shot_number", data=[1, 1])
        shots.create_dataset(
            "shot_date",
            data=np.asarray(["2025-01-16", "2025-01-16"], dtype=string_dtype),
        )
        shots.create_dataset(
            "date_time",
            data=np.asarray(
                ["2025-01-16T09:00:00", "2025-01-16T09:00:04"],
                dtype=string_dtype,
            ),
        )
        shots.create_dataset(
            "campaign",
            data=np.asarray([EXPERIMENT_ID, EXPERIMENT_ID], dtype=string_dtype),
        )


def build_args(
    *,
    trigger_jsonl,
    labfrog_nexus,
    output_nexus,
    sources_file,
    time_match_autoassign=False,
) -> argparse.Namespace:
    return argparse.Namespace(
        events_jsonl=[],
        event_json=[],
        watchdog_jsonl=[],
        trigger_jsonl=trigger_jsonl,
        labfrog_nexus=labfrog_nexus,
        labfrog_sqlite=None,
        mongo_uri=None,
        mongo_database=None,
        mongo_collection=None,
        mongo_query_json="",
        experiment_id=EXPERIMENT_ID,
        source_key=SOURCE_KEY,
        output_nexus=output_nexus,
        sources_file=sources_file,
        match_tolerance_s=120.0,
        campaign_timezone="Europe/Berlin",
        time_match_autoassign=time_match_autoassign,
    )


def write_trigger_event_v1(
    path: Path,
    *,
    event_id: str,
    shot_number: int | None,
    timestamp: str,
    trigger_role: str = "pump",
) -> None:
    """Write a flat hzdr-event-v1 trigger envelope as shotcounter's
    Kafka branch emits."""
    event: dict = {
        "schema_version": "hzdr-event-v1",
        "event_id": event_id,
        "experiment_id": EXPERIMENT_ID,
        "source": "DRACO-Trigger",
        "kind": "draco.trigger",
        "trigger_role": trigger_role,
        "timestamp": timestamp,
        "transport": "kafka",
        "payload_ref": {"channel_id": "Draco01", "run_id": 4},
        "values": None,
        "metadata": {"device": "DRACO-01"},
    }
    if shot_number is not None:
        event["shot_number"] = shot_number
    write_json(path, event)


def write_trigger_event(path: Path, *, shot_number: int | None, timestamp: str) -> None:
    payload: dict = {
        "Name": "Draco01",
        "Campaign": EXPERIMENT_ID,
        "nickname": "trigger_shot_solenoid",
        "trigger_role": "pump",
        "threshold": 0.25,
        "adc_value": 0.81,
        "channel_trigger_count": 17,
        "run_id": 4,
        "timestamp": timestamp,
        "sample_counter_10hz": 9012,
    }
    if shot_number is not None:
        payload["shot_number"] = shot_number
    write_json(path, {"processed_message": payload})


def test_ambiguous_duplicate_shot_number_is_listed_for_review(tmp_path: Path):
    """Matcher stays authoritative; ambiguous events must be visible in the
    API-facing catalog, not just the NeXus source_events group."""
    labfrog_nexus = tmp_path / "labfrog.nxs"
    trigger_event = tmp_path / "trigger.jsonl"
    output_nexus = tmp_path / "canonical.nxs"
    sources_file = tmp_path / "hzdr_sources.json"
    write_labfrog_export_with_duplicate_shot_number(labfrog_nexus)
    write_trigger_event(trigger_event, shot_number=1, timestamp="2025-01-16T08:00:02Z")

    args = build_args(
        trigger_jsonl=[trigger_event],
        labfrog_nexus=labfrog_nexus,
        output_nexus=output_nexus,
        sources_file=sources_file,
    )
    _, built_sources = hzdr_hdf5_builder.build(args)

    provider = HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=built_sources)
    )
    source = provider.get_source(SOURCE_KEY)
    assert source is not None
    assert source.match_summary.ambiguous == 1
    assert source.match_summary.unmatched == 0
    assert len(source.review_events) == 1
    review_event = source.review_events[0]
    assert review_event.match_status == "ambiguous"
    assert review_event.source == "DRACO-Trigger"
    # both tied shots share the same shot_key (same campaign/date/shot_number),
    # so the matcher's tie is between two distinct LabFrog records, not two keys
    assert review_event.candidate_shot_keys == [
        f"{EXPERIMENT_ID}:20250116:000001",
        f"{EXPERIMENT_ID}:20250116:000001",
    ]
    # neither tied shot should have silently absorbed the event: both stay
    # "labfrog-only" (each still carries its own synthetic LabFrog event, but
    # no DRACO-Trigger event), and match_summary.matched stays 0
    assert all(shot.match_status == "labfrog-only" for shot in source.shots)
    assert all(
        "DRACO-Trigger" not in {event.source for event in shot.events}
        for shot in source.shots
    )
    assert source.match_summary.matched == 0


def test_numbered_trigger_without_labfrog_row_joins_preserved_nexus(tmp_path: Path):
    """The preserved LabFrog path includes an independently numbered shot."""
    labfrog_nexus = tmp_path / "labfrog.nxs"
    trigger_event = tmp_path / "trigger.jsonl"
    output_nexus = tmp_path / "canonical.nxs"
    sources_file = tmp_path / "hzdr_sources.json"
    write_labfrog_export(labfrog_nexus)
    # Number 99 matches no LabFrog row and is far outside the time window.
    write_trigger_event(trigger_event, shot_number=99, timestamp="2025-06-01T08:00:02Z")

    args = build_args(
        trigger_jsonl=[trigger_event],
        labfrog_nexus=labfrog_nexus,
        output_nexus=output_nexus,
        sources_file=sources_file,
    )
    _, built_sources = hzdr_hdf5_builder.build(args)

    provider = HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=built_sources)
    )
    source = provider.get_source(SOURCE_KEY)
    assert source is not None
    assert source.match_summary.unmatched == 0
    assert source.match_summary.matched == 1
    assert source.review_events == []
    trigger_only = next(shot for shot in source.shots if shot.shot_number == 99)
    assert trigger_only.match_status == "matched"
    assert trigger_only.labfrog_record_id is None
    with h5py.File(output_nexus, "r") as handle:
        assert list(handle["entry/shots/shot_number"]) == [1, 1, 99]
        assert handle["entry/shots"].attrs["labfrog_shot_count"] == 2
    assert source.match_summary.ambiguous == 0


def test_missing_shot_number_falls_back_to_nearest_time_or_unmatched(
    tmp_path: Path,
):
    """An event with no shot_number at all (e.g. shotcounter's IsShotCounterXX
    never enabled) must not crash and must still be classified, not dropped.

    The pre-A7 ladder, opted into: nearest time attaches it. The default
    (ruling A7, 2026-09-30) only proposes it -- see the next test."""
    labfrog_nexus = tmp_path / "labfrog.nxs"
    trigger_event = tmp_path / "trigger.jsonl"
    output_nexus = tmp_path / "canonical.nxs"
    sources_file = tmp_path / "hzdr_sources.json"
    write_labfrog_export(labfrog_nexus)
    # No shot_number key at all, but the timestamp is close to the day-two shot.
    write_trigger_event(
        trigger_event, shot_number=None, timestamp="2025-01-16T08:00:02Z"
    )

    args = build_args(
        trigger_jsonl=[trigger_event],
        labfrog_nexus=labfrog_nexus,
        output_nexus=output_nexus,
        sources_file=sources_file,
        time_match_autoassign=True,
    )
    _, built_sources = hzdr_hdf5_builder.build(args)

    provider = HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=built_sources)
    )
    source = provider.get_source(SOURCE_KEY)
    assert source is not None
    # nearest-time rescues it: matched to the closer (day two) shot, the other
    # shot stays labfrog-only
    assert source.match_summary.matched == 1
    assert source.match_summary.ambiguous == 0
    assert source.match_summary.unmatched == 0
    assert source.review_events == []
    matched_shot = next(shot for shot in source.shots if shot.match_status == "matched")
    assert matched_shot.shot_date == "2025-01-16"


def test_by_default_an_unnumbered_trigger_is_proposed_not_attached(tmp_path: Path):
    """Ruling A7: the same trigger as above is a review candidate for the
    nearer shot, and no LabFrog shot is attached until a person rules."""
    labfrog_nexus = tmp_path / "labfrog.nxs"
    trigger_event = tmp_path / "trigger.jsonl"
    output_nexus = tmp_path / "canonical.nxs"
    sources_file = tmp_path / "hzdr_sources.json"
    write_labfrog_export(labfrog_nexus)
    write_trigger_event(
        trigger_event, shot_number=None, timestamp="2025-01-16T08:00:02Z"
    )

    _, built_sources = hzdr_hdf5_builder.build(
        build_args(
            trigger_jsonl=[trigger_event],
            labfrog_nexus=labfrog_nexus,
            output_nexus=output_nexus,
            sources_file=sources_file,
        )
    )
    source = HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=built_sources)
    ).get_source(SOURCE_KEY)
    assert source is not None
    assert source.match_summary.matched == 0
    assert source.match_summary.ambiguous == 1
    assert len(source.review_events) == 1
    assert all(shot.match_status != "matched" for shot in source.shots)


def test_flat_hzdr_event_v1_trigger_matches_shot(tmp_path: Path):
    """The builder must accept the flat hzdr-event-v1 Kafka envelope that
    shotcounter's feature branch emits (no processed_message wrapper, trigger_role
    at top level) and match it to the correct LabFrog shot."""
    labfrog_nexus = tmp_path / "labfrog.nxs"
    trigger_event = tmp_path / "trigger.jsonl"
    output_nexus = tmp_path / "canonical.nxs"
    sources_file = tmp_path / "hzdr_sources.json"
    write_labfrog_export(labfrog_nexus)
    write_trigger_event_v1(
        trigger_event,
        event_id="evt-draco-v1-001",
        shot_number=1,
        timestamp="2025-01-16T08:00:02Z",
    )

    args = build_args(
        trigger_jsonl=[trigger_event],
        labfrog_nexus=labfrog_nexus,
        output_nexus=output_nexus,
        sources_file=sources_file,
    )
    _, built_sources = hzdr_hdf5_builder.build(args)

    provider = HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=built_sources)
    )
    source = provider.get_source(SOURCE_KEY)
    assert source is not None
    assert source.match_summary.matched == 1
    assert source.match_summary.ambiguous == 0
    assert source.match_summary.unmatched == 0
    assert source.review_events == []

    matched_shot = next(shot for shot in source.shots if shot.match_status == "matched")
    assert matched_shot.shot_date == "2025-01-16"
    draco_event = next(e for e in matched_shot.events if e.source == "DRACO-Trigger")
    assert draco_event.kind == "draco.trigger"


def write_labfrog_sqlite_export(
    path: Path,
    rows: list[tuple],
    *,
    with_shot_status: bool = True,
    local_counts: list[int | None] | None = None,
    claimed: bool = False,
) -> None:
    """A curated LabFrog SQLite export, optionally with schema v13 claims.

    `with_shot_status=False` is an export written before the column existed.
    `local_counts` adds the v12 `shots.local_count` column, one value per row;
    without it the export has no such column, like one written before v12.
    """
    columns = [
        "mongo_id TEXT PRIMARY KEY",
        "shot_number INTEGER",
        "date_time TEXT",
        "date_time_utc TEXT",
        "campaign TEXT",
        "experiment_id TEXT",
        "status TEXT",
        "version INTEGER",
    ]
    if with_shot_status:
        columns.append("shot_status TEXT")
    rows = [row if with_shot_status else row[:-1] for row in rows]
    if local_counts is not None:
        columns.append("local_count INTEGER")
        rows = [(*row, count) for row, count in zip(rows, local_counts, strict=True)]
    if claimed:
        columns.append("authority_shot_number INTEGER")
        rows = [(*row, row[1]) for row in rows]
    with sqlite3.connect(path) as connection:
        connection.execute(f"CREATE TABLE shots ({', '.join(columns)})")
        placeholders = ", ".join("?" for _ in columns)
        connection.executemany(
            f"INSERT INTO shots VALUES ({placeholders})",  # noqa: S608
            rows,
        )


def _labfrog_row(shot_number: int, minute: int, shot_status: str | None) -> tuple:
    return (
        f"mongo-{shot_number}",
        shot_number,
        f"2025-01-16T09:{minute:02d}:00",
        f"2025-01-16T08:{minute:02d}:00Z",
        EXPERIMENT_ID,
        EXPERIMENT_ID,
        "active",
        0,
        shot_status,
    )


def sqlite_build_args(
    *, labfrog_sqlite: Path, trigger_jsonl: list[Path], tmp_path: Path
) -> argparse.Namespace:
    args = build_args(
        trigger_jsonl=trigger_jsonl,
        labfrog_nexus=None,
        output_nexus=tmp_path / "canonical.nxs",
        sources_file=tmp_path / "hzdr_sources.json",
    )
    args.labfrog_sqlite = labfrog_sqlite
    return args


def test_labfrog_misfire_is_built_as_a_flagged_shot_not_dropped(tmp_path: Path):
    """Plan W10: a misfire from the LabFrog export is still a shot, flagged."""
    labfrog_sqlite = tmp_path / "campaign.sqlite"
    write_labfrog_sqlite_export(
        labfrog_sqlite,
        [
            _labfrog_row(1, 0, "shot"),
            _labfrog_row(2, 1, "misfire"),
            # Saved before LabFrog recorded a status: NULL reads as a shot.
            _labfrog_row(3, 2, None),
        ],
        claimed=True,
    )
    misfire_trigger = tmp_path / "trigger-2.jsonl"
    write_trigger_event_v1(
        misfire_trigger,
        event_id="evt-draco-misfire",
        shot_number=2,
        timestamp="2025-01-16T08:01:02Z",
    )
    trigger_only = tmp_path / "trigger-4.jsonl"
    write_trigger_event_v1(
        trigger_only,
        event_id="evt-draco-trigger-only",
        shot_number=4,
        # Far from every LabFrog time, so no time-based rank can claim it.
        timestamp="2025-01-16T10:00:00Z",
    )

    built_nexus, built_sources = hzdr_hdf5_builder.build(
        sqlite_build_args(
            labfrog_sqlite=labfrog_sqlite,
            trigger_jsonl=[misfire_trigger, trigger_only],
            tmp_path=tmp_path,
        )
    )

    with h5py.File(built_nexus, "r") as handle:
        assert sorted(handle["entry/shots/shot_number"][...].tolist()) == [1, 2, 3, 4]  # pyright: ignore[reportAttributeAccessIssue, reportIndexIssue]
        assert handle["entry/shots"].attrs["damnit_bridge_profile"] == (
            "hzdr-canonical-shot-v6"
        ), "shot_status must not change the bridge layout"
        events = handle["entry/source_events"]
        labfrog_status = {
            number: json.loads(metadata)["shot_status"]
            for source, number, metadata in zip(
                events["source"].asstr()[...],  # pyright: ignore[reportAttributeAccessIssue, reportIndexIssue]
                events["shot_number"][...].tolist(),  # pyright: ignore[reportAttributeAccessIssue, reportIndexIssue]
                events["metadata_json"].asstr()[...],  # pyright: ignore[reportAttributeAccessIssue, reportIndexIssue]
                strict=True,
            )
            if source == "LabFrog"
        }
    assert labfrog_status == {1: "shot", 2: "misfire", 3: "shot"}

    provider = HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=built_sources)
    )
    source = provider.get_source(SOURCE_KEY)
    assert source is not None
    by_number = {shot.shot_number: shot for shot in source.shots}
    assert set(by_number) == {1, 2, 3, 4}
    assert by_number[2].metadata["shot_status"] == "misfire"
    assert by_number[2].match_status == "matched", "a misfire's trigger still attaches"
    assert by_number[1].metadata["shot_status"] == "shot"
    assert by_number[3].metadata["shot_status"] == "shot"
    # A trigger-only shot has no LabFrog record: its LabFrog columns are
    # absent, never invented.
    assert "shot_status" not in by_number[4].metadata


def test_labfrog_export_without_shot_status_reads_every_shot_as_a_shot(
    tmp_path: Path,
):
    labfrog_sqlite = tmp_path / "campaign.sqlite"
    write_labfrog_sqlite_export(
        labfrog_sqlite,
        [_labfrog_row(1, 0, None), _labfrog_row(2, 1, None)],
        with_shot_status=False,
    )

    _, built_sources = hzdr_hdf5_builder.build(
        sqlite_build_args(
            labfrog_sqlite=labfrog_sqlite, trigger_jsonl=[], tmp_path=tmp_path
        )
    )

    source = HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=built_sources)
    ).get_source(SOURCE_KEY)
    assert source is not None
    assert [shot.metadata["shot_status"] for shot in source.shots] == ["shot", "shot"]


def test_labfrog_local_count_rides_beside_each_shot_as_a_user_field(tmp_path: Path):
    """Bridge v5: LabFrog's local_count lands in /entry/shots/labfrog_local_count.

    It is the experimenters' Count, never the governed shot_number: the shot
    numbers are untouched, no other dataset name starts with `shot_number`
    (the aligner's G8 rule), and a shot without a count gets -1, not a guess.
    """
    labfrog_sqlite = tmp_path / "campaign.sqlite"
    write_labfrog_sqlite_export(
        labfrog_sqlite,
        [
            _labfrog_row(1, 0, "shot"),
            _labfrog_row(2, 1, "shot"),
            # No active local-counter reset covers this shot.
            _labfrog_row(3, 2, "shot"),
        ],
        local_counts=[7, 8, None],
    )
    trigger_only = tmp_path / "trigger-4.jsonl"
    write_trigger_event_v1(
        trigger_only,
        event_id="evt-draco-trigger-only",
        shot_number=4,
        timestamp="2025-01-16T10:00:00Z",
    )

    built_nexus, built_sources = hzdr_hdf5_builder.build(
        sqlite_build_args(
            labfrog_sqlite=labfrog_sqlite,
            trigger_jsonl=[trigger_only],
            tmp_path=tmp_path,
        )
    )

    with h5py.File(built_nexus, "r") as handle:
        shots = cast("h5py.Group", handle["entry/shots"])
        assert shots.attrs["damnit_bridge_profile"] == "hzdr-canonical-shot-v6"
        column = cast("h5py.Dataset", shots["labfrog_local_count"])
        assert column.dtype.kind == "i"
        description = str(column.attrs["description"])
        assert "local-counter reset" in description
        assert "not an identifier" in description
        numbers = cast("h5py.Dataset", shots["shot_number"])[...].tolist()
        counts = column[...].tolist()
        assert dict(zip(numbers, counts, strict=True)) == {1: 7, 2: 8, 3: -1, 4: -1}
        names = [str(name) for name in shots]
        assert [name for name in names if name.startswith("shot_number")] == [
            "shot_number"
        ]

    catalog = json.loads(built_sources.read_text(encoding="utf-8"))
    by_number = {shot["shot_number"]: shot for shot in catalog["sources"][0]["shots"]}
    assert by_number[1]["labfrog_local_count"] == 7
    assert by_number[2]["labfrog_local_count"] == 8
    assert "local_count" not in by_number[1]["metadata"]
    # No count is carried where LabFrog has none, and none is invented for a
    # trigger-only shot.
    assert "labfrog_local_count" not in by_number[3]
    assert "labfrog_local_count" not in by_number[4]


def test_labfrog_export_without_local_count_still_builds(tmp_path: Path):
    """An export written before schema v12 has no local_count column."""
    labfrog_sqlite = tmp_path / "campaign.sqlite"
    write_labfrog_sqlite_export(
        labfrog_sqlite, [_labfrog_row(1, 0, "shot"), _labfrog_row(2, 1, "shot")]
    )

    built_nexus, _ = hzdr_hdf5_builder.build(
        sqlite_build_args(
            labfrog_sqlite=labfrog_sqlite, trigger_jsonl=[], tmp_path=tmp_path
        )
    )

    with h5py.File(built_nexus, "r") as handle:
        assert handle["entry/shots/shot_number"][...].tolist() == [1, 2]  # pyright: ignore[reportAttributeAccessIssue, reportIndexIssue]
        assert handle["entry/shots/labfrog_local_count"][...].tolist() == [-1, -1]  # pyright: ignore[reportAttributeAccessIssue, reportIndexIssue]
