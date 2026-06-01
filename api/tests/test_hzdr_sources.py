from pathlib import Path

import h5py
import numpy as np
import orjson
import pytest

from damnit_api.metadata.hzdr_sources import (
    HZDRSourceProvider,
    _map_mongo_shot,
    list_hdf5_datasets,
    load_sources_file,
    preview_hdf5_dataset,
)
from damnit_api.metadata.routers import append_emulated_shot
from damnit_api.shared.settings import MetadataSettings


def write_source_fixture(tmp_path: Path) -> Path:
    """Write a minimal source fixture without relying on tracked example data."""
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps(
            {
                "sources": [
                    {
                        "key": "hzdr-local",
                        "title": "HZDR local file fixture",
                        "damnit_path": "damnit/hzdr-local",
                        "metadata": {"facility": "HZDR"},
                        "shots": [
                            {
                                "source_key": "hzdr-local",
                                "shot_number": 1001,
                                "fired_at": "2026-05-05T08:15:00Z",
                                "metadata": {"status": "processed"},
                            },
                            {
                                "source_key": "hzdr-local",
                                "shot_number": 1002,
                                "fired_at": "2026-05-05T08:17:30Z",
                                "metadata": {"status": "metadata-only"},
                            },
                        ],
                    }
                ]
            }
        )
    )
    return path


def test_load_hzdr_sources_from_json_file(tmp_path: Path):
    """JSON fixtures provide source metadata without MyMdC."""
    path = write_source_fixture(tmp_path)

    sources = load_sources_file(path)

    assert [source.key for source in sources] == ["hzdr-local"]
    assert sources[0].metadata["facility"] == "HZDR"
    assert [shot.shot_number for shot in sources[0].shots] == [1001, 1002]


def test_local_provider_returns_sources_from_file(tmp_path: Path):
    """The local provider is the default for file-backed HZDR testing."""
    path = write_source_fixture(tmp_path)
    settings = MetadataSettings(
        provider="local",
        sources_file=path,
    )

    source = HZDRSourceProvider(settings).get_source("hzdr-local")

    assert source is not None
    assert source.title == "HZDR local file fixture"


def test_local_provider_returns_shots_from_file(tmp_path: Path):
    """HZDR fixtures are shot-first rather than proposal-first."""
    path = write_source_fixture(tmp_path)
    settings = MetadataSettings(
        provider="local",
        sources_file=path,
    )

    shots = HZDRSourceProvider(settings).list_shots("hzdr-local")

    assert [shot.shot_number for shot in shots] == [1001, 1002]
    assert shots[0].fired_at == "2026-05-05T08:15:00Z"


def test_map_mongo_shot_supports_shot_alias_fields():
    """Existing shot documents can use `shot` and `timestamp` field names."""
    record = {
        "shot": 77,
        "timestamp": "2026-05-05T10:00:00Z",
        "status": "processed",
    }

    shot = _map_mongo_shot(
        record,
        "hzdr-local",
        shot_number_field="shot_number",
        fired_at_field="fired_at",
    )

    assert shot is not None
    assert shot.source_key == "hzdr-local"
    assert shot.shot_number == 77
    assert shot.fired_at == "2026-05-05T10:00:00Z"
    assert shot.metadata["status"] == "processed"


def test_list_hdf5_datasets_reads_structure_without_full_arrays(tmp_path: Path):
    """Shot details expose HDF5 dataset names, dtypes, and shapes."""
    hdf5_path = tmp_path / "shot.h5"
    with h5py.File(hdf5_path, "w") as handle:
        handle.create_dataset("signal", data=np.asarray([1.0, 1.2]))
        handle.create_dataset("image_preview", data=np.arange(4).reshape(2, 2))

    datasets = list_hdf5_datasets(hdf5_path)

    assert [(dataset.name, dataset.shape) for dataset in datasets] == [
        ("image_preview", [2, 2]),
        ("signal", [2]),
    ]


def test_single_value_hdf5_vector_previews_as_scalar(tmp_path: Path):
    """One-value vectors should not be treated as line/trend previews."""
    hdf5_path = tmp_path / "shot.h5"
    with h5py.File(hdf5_path, "w") as handle:
        handle.create_dataset("single_value", data=np.asarray([1.25]))
        handle.create_dataset("lineout", data=np.asarray([1.0, 1.5]))

    scalar_preview = preview_hdf5_dataset(hdf5_path, "single_value")
    line_preview = preview_hdf5_dataset(hdf5_path, "lineout")

    assert scalar_preview.preview_kind == "scalar"
    assert scalar_preview.preview == pytest.approx(1.25)
    assert line_preview.preview_kind == "line"
    assert line_preview.preview == [1.0, 1.5]


def test_watchdog_flow_monitor_event_uses_kafka_shape(tmp_path: Path):
    """Watchdog enrichment should look like the production Kafka path."""
    sources_file = write_source_fixture(tmp_path)

    source = append_emulated_shot(
        sources_file,
        source_key="hzdr-local",
        event_source="PLANET-Watchdog",
        event_kind="watchdog_shot_event",
        action="enrich",
    )

    assert source.shots[-1].metadata["emulated_last_enrichment_source"] == (
        "PLANET-Watchdog"
    )
    event_path = tmp_path / "events" / "planet-watchdog.jsonl"
    event = orjson.loads(event_path.read_bytes().splitlines()[-1])
    assert event["transport"] == "kafka"
    assert event["payload_ref"] == {
        "offset": 1,
        "partition": 0,
        "producer": "planet-watchdog",
        "topic": "planet.watchdog.events",
    }


def test_shotcounter_flow_monitor_event_uses_zmq_kafka_shape(tmp_path: Path):
    """Shotcounter starts new shots through a ZMQ/Kafka-shaped event."""
    sources_file = write_source_fixture(tmp_path)

    source = append_emulated_shot(
        sources_file,
        source_key="hzdr-local",
        event_source="Shotcounter",
        event_kind="shot_counter_event",
        action="append",
    )

    assert source.shots[-1].metadata["emulated_source"] == "Shotcounter"
    assert source.shots[-1].metadata["shotcounter_status"] == "shot-opened"
    event_path = tmp_path / "events" / "shotcounter.jsonl"
    event = orjson.loads(event_path.read_bytes().splitlines()[-1])
    assert event["transport"] == "zmq+kafka"
    assert event["payload_ref"] == {
        "endpoint": "shotcounter-zmq",
        "offset": 3,
        "partition": 0,
        "producer": "shotcounter",
        "topic": "shotcounter.shots",
    }


def test_motion_auto_logger_flow_monitor_event_enriches_latest_shot(
    tmp_path: Path,
):
    """Motion autologging is an optional Kafka-backed enrichment source."""
    sources_file = write_source_fixture(tmp_path)

    source = append_emulated_shot(
        sources_file,
        source_key="hzdr-local",
        event_source="motion-auto-logger",
        event_kind="motion_stage_event",
        action="enrich",
    )

    metadata = source.shots[-1].metadata
    assert metadata["emulated_last_enrichment_source"] == "motion-auto-logger"
    assert metadata["motion_status"] == "captured"
    assert metadata["motion_stage_x_mm"] == pytest.approx(-0.235)
    assert metadata["motion_stage_y_mm"] == pytest.approx(0.168)
    assert metadata["motion_stage_z_mm"] == pytest.approx(1.775)

    event_path = tmp_path / "events" / "motion-auto-logger.jsonl"
    event = orjson.loads(event_path.read_bytes().splitlines()[-1])
    assert event["transport"] == "kafka"
    assert event["payload_ref"] == {
        "offset": 1,
        "partition": 0,
        "producer": "motion-auto-logger",
        "topic": "motion.auto.logger.events",
    }
    assert event["values"] == pytest.approx([-0.235, 0.168, 1.775])
