import argparse
import importlib.util
import json
import sys
from pathlib import Path

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
    *, trigger_jsonl, labfrog_nexus, output_nexus, sources_file
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


def test_unmatched_event_with_no_candidate_is_listed_for_review(tmp_path: Path):
    """A trigger far outside the tolerance window and with no shot_number match
    must land as unmatched, not crash, and not be silently dropped."""
    labfrog_nexus = tmp_path / "labfrog.nxs"
    trigger_event = tmp_path / "trigger.jsonl"
    output_nexus = tmp_path / "canonical.nxs"
    sources_file = tmp_path / "hzdr_sources.json"
    write_labfrog_export(labfrog_nexus)
    # shot_number=99 matches no LabFrog shot, and the timestamp is far outside
    # match_tolerance_s of either shot, so nearest-time can't rescue it either.
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
    assert source.match_summary.unmatched == 1
    assert source.match_summary.ambiguous == 0
    assert len(source.review_events) == 1
    assert source.review_events[0].match_status == "unmatched"
    assert source.review_events[0].candidate_shot_keys == []


def test_missing_shot_number_falls_back_to_nearest_time_or_unmatched(
    tmp_path: Path,
):
    """An event with no shot_number at all (e.g. shotcounter's IsShotCounterXX
    never enabled) must not crash and must still be classified, not dropped."""
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
