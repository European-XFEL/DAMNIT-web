import importlib.util
import json
import sys
from pathlib import Path

import h5py
import pytest

from damnit_api.metadata.hzdr_sources import load_sources_file
from damnit_api.metadata.routers import (
    update_local_shot_metadata,
    update_local_shot_status,
)

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "hzdr-package-emulator.py"
SPEC = importlib.util.spec_from_file_location("hzdr_package_emulator", SCRIPT_PATH)
assert SPEC is not None
hzdr_package_emulator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["hzdr_package_emulator"] = hzdr_package_emulator
SPEC.loader.exec_module(hzdr_package_emulator)


def write_event(path: Path, **overrides):
    event = {
        "experiment_id": "exp-test",
        "shot_id": "shot-000123",
        "source": "LaserData",
        "kind": "pulse_energy_j",
        "timestamp": "2026-05-22T08:30:01Z",
        "transport": "asapo",
        "payload_ref": {
            "endpoint": "localhost:8400",
            "beamtime": "asapo_test",
            "data_source": "hzdr-damnit",
            "stream": "laser",
            "message_id": 123,
        },
        "values": [12.5],
        "metadata": {"unit": "J"},
    }
    event.update(overrides)
    path.write_text(json.dumps(event), encoding="utf-8")


def test_package_emulator_writes_source_fixture_and_hdf5(tmp_path: Path):
    events_dir = tmp_path / "events-in"
    events_dir.mkdir()
    write_event(events_dir / "laserdata.json")
    write_event(
        events_dir / "watchdog.json",
        source="PLANET-Watchdog",
        kind="mongodb_shotsheet",
        transport="kafka",
        payload_ref={"topic": "planet.watchdog.events", "partition": 0, "offset": 42},
        metadata={"hdf5_path": "Z:/bigdata/hzdr/experiments/exp-test.h5"},
    )

    package = hzdr_package_emulator.run_emulator(
        events_dir=events_dir,
        output_dir=tmp_path / "out",
        source_key="hzdr-emulator",
        experiment_id=None,
        shot_count=1,
        shot_increment=1,
    )

    assert (package.events_dir / "laserdata.jsonl").exists()
    assert (package.events_dir / "planet-watchdog.jsonl").exists()

    sources = load_sources_file(package.sources_file)
    assert sources[0].key == "hzdr-emulator"
    assert sources[0].shots[0].shot_number == 123
    assert sources[0].shots[0].hdf5_path == package.hdf5_path
    assert len(sources[0].shots[0].events) == 2
    assert len(sources[0].shots[0].data_products) == 2

    with h5py.File(package.hdf5_path, "r") as handle:
        assert handle.attrs["profile"] == "hzdr-package-emulator"
        assert "events/payload_ref_json" in handle
        assert "metadata/mongodb_by_shot_json" in handle
        assert "signals/LaserData/pulse_energy_j/values" in handle

        assert "fixtures/scalars/laser_energy_j_by_shot" in handle
        assert "fixtures/lineouts/pulse_energy_j_by_shot" in handle
        assert "fixtures/images/camera_raw_by_shot" in handle
        assert "fixtures/images/camera_mask_by_shot" in handle
        assert "fixtures/images/camera_labels_by_shot" in handle
        assert "fixtures/stacks/camera_stack_by_shot" in handle
        assert "fixtures/by_shot/shot-000123/scalars/laser_energy_j" in handle
        assert "fixtures/by_shot/shot-000123/lineouts/pulse_energy_j" in handle
        assert "fixtures/by_shot/shot-000123/images/camera_raw" in handle
        assert "entry/shots/shot_key" in handle
        assert "entry/source_events/event_id" in handle
        assert "entry/data_products/dataset_path" in handle
        assert "entry/laserdata/pulse_energy_j" in handle


def test_package_emulator_can_expand_shots(tmp_path: Path):
    events_dir = tmp_path / "events-in"
    events_dir.mkdir()
    write_event(events_dir / "laserdata.json")

    package = hzdr_package_emulator.run_emulator(
        events_dir=events_dir,
        output_dir=tmp_path / "out",
        source_key="hzdr-emulator",
        experiment_id=None,
        shot_count=3,
        shot_increment=2,
    )

    sources = load_sources_file(package.sources_file)
    assert [shot.shot_number for shot in sources[0].shots] == [123, 125, 127]
    assert len({shot.metadata["laser_energy_j"] for shot in sources[0].shots}) == 3
    assert (
        len({shot.metadata["detector_signal_mean"] for shot in sources[0].shots}) == 3
    )

    with h5py.File(package.hdf5_path, "r") as handle:
        assert list(handle["index/shot_id"].asstr()[...]) == [
            "shot-000123",
            "shot-000125",
            "shot-000127",
        ]
        assert handle["fixtures/scalars/laser_energy_j_by_shot"].shape == (3,)
        assert handle["fixtures/lineouts/pulse_energy_j_by_shot"].shape == (3, 128)
        assert handle["fixtures/images/camera_raw_by_shot"].shape == (3, 64, 64)


def test_local_shot_status_update_records_review_history(tmp_path: Path):
    events_dir = tmp_path / "events-in"
    events_dir.mkdir()
    write_event(events_dir / "laserdata.json")

    package = hzdr_package_emulator.run_emulator(
        events_dir=events_dir,
        output_dir=tmp_path / "out",
        source_key="hzdr-emulator",
        experiment_id=None,
        shot_count=1,
        shot_increment=1,
    )

    updated_shot = update_local_shot_status(
        package.sources_file,
        source_key="hzdr-emulator",
        shot_number=123,
        status="revision-needed",
        note="Processed data needs revision",
        reviewed_by="hzdr-dev",
    )

    assert updated_shot.metadata["status"] == "revision-needed"
    assert updated_shot.metadata["reviewed_by"] == "hzdr-dev"
    assert updated_shot.metadata["review_note"] == "Processed data needs revision"
    assert updated_shot.metadata["status_history"][-1]["to"] == "revision-needed"
    assert updated_shot.metadata["status_history"][-1]["by"] == "hzdr-dev"

    sources = load_sources_file(package.sources_file)
    assert sources[0].shots[0].metadata["status"] == "revision-needed"


def test_local_shot_metadata_correction_records_history(tmp_path: Path):
    events_dir = tmp_path / "events-in"
    events_dir.mkdir()
    write_event(events_dir / "laserdata.json")

    package = hzdr_package_emulator.run_emulator(
        events_dir=events_dir,
        output_dir=tmp_path / "out",
        source_key="hzdr-emulator",
        experiment_id=None,
        shot_count=1,
        shot_increment=1,
    )

    updated_shot = update_local_shot_metadata(
        package.sources_file,
        source_key="hzdr-emulator",
        shot_number=123,
        key="laser_energy_j",
        value=11.75,
        note="Corrected from the logbook",
        corrected_by="hzdr-dev",
    )

    assert updated_shot.metadata["laser_energy_j"] == pytest.approx(11.75)
    correction = updated_shot.metadata["metadata_correction_history"][-1]
    assert correction["key"] == "laser_energy_j"
    assert correction["to"] == pytest.approx(11.75)
    assert correction["by"] == "hzdr-dev"

    sources = load_sources_file(package.sources_file)
    assert sources[0].shots[0].metadata["laser_energy_j"] == pytest.approx(11.75)
