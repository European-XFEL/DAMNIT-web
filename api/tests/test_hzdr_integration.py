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
            "_kafka": {"topic": "planet-watchdog-events", "offset": 42},
        },
    )
    write_json(
        trigger_event,
        {
            "processed_message": {
                "Name": "Draco01",
                "Nickname": "trigger_shot_solenoid",
                "Trigger_threshold": 0.25,
                "ADC_value": 0.81,
                "Channel_counter": 17,
                "Run_id": 4,
                "Event_timestamp": "2025-01-16T08:00:02Z",
                "10Hz_counter": 9012,
                "Campaign": EXPERIMENT_ID,
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
        assert list(handle["entry/shots/shot_number"][...]) == [1, 1]
        assert list(handle["entry/shots/shot_key"].asstr()[...]) == [
            f"{EXPERIMENT_ID}:20250115:000001",
            f"{EXPERIMENT_ID}:20250116:000001",
        ]
        assert set(handle["entry/source_events/source"].asstr()[...]) == {
            "DRACO-Trigger",
            "LabFrog",
            "LaserData",
            "PLANET-Watchdog",
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
        "PLANET-Watchdog",
    }
    assert {event.source for event in source.shots[0].events} == {"LabFrog"}

    camera_product = next(
        product
        for product in source.shots[1].data_products
        if product.source == "LaserData" and product.dataset_name
    )
    with h5py.File(built_nexus, "r") as handle:
        assert handle[camera_product.dataset_name][...].tolist() == [
            [1.0, 2.0],
            [3.0, 4.0],
        ]
    preview = preview_hdf5_dataset(built_nexus, camera_product.dataset_name)
    assert preview.preview_kind == "image"
    assert preview.preview == [[0.0, 1 / 3], [2 / 3, 1.0]]
