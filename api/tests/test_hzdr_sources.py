from pathlib import Path

import h5py
import numpy as np
import orjson
import pytest

from damnit_api.metadata.hzdr_event import lint_metadata_keys
from damnit_api.metadata.hzdr_routers import append_emulated_shot
from damnit_api.metadata.hzdr_sources import (
    HZDRSourceProvider,
    _map_mongo_shot,
    list_hdf5_datasets,
    load_sources_file,
    preview_hdf5_dataset,
)
from damnit_api.shared.settings import MetadataSettings


def write_source_fixture(tmp_path: Path) -> Path:
    """Write a minimal source fixture without relying on tracked example data."""
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
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
        })
    )
    return path


def test_load_hzdr_sources_from_json_file(tmp_path: Path):
    """JSON fixtures provide source metadata without MyMdC."""
    path = write_source_fixture(tmp_path)

    sources = load_sources_file(path)

    assert [source.key for source in sources] == ["hzdr-local"]
    assert sources[0].metadata["facility"] == "HZDR"
    assert [shot.shot_number for shot in sources[0].shots] == [1001, 1002]


def test_shot_surfaces_target_wiki_link_from_metadata(tmp_path: Path):
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": "hzdr-local",
                    "title": "HZDR local file fixture",
                    "damnit_path": "damnit/hzdr-local",
                    "metadata": {},
                    "shots": [
                        {
                            "source_key": "hzdr-local",
                            "shot_number": 1001,
                            "fired_at": "2026-05-05T08:15:00Z",
                            "metadata": {
                                "target": {
                                    "name": "Au witness",
                                    "provenance": "wiki",
                                    "wiki_page": "Target_Au_5um_A12",
                                    "wiki_ref": "https://wiki.example/Target_Au_5um_A12",
                                }
                            },
                        }
                    ],
                }
            ]
        })
    )

    shot = load_sources_file(path)[0].shots[0]

    assert shot.target_wiki_page == "Target_Au_5um_A12"
    assert shot.target_wiki_ref == "https://wiki.example/Target_Au_5um_A12"
    assert shot.model_dump(mode="json")["target_wiki_ref"] == (
        "https://wiki.example/Target_Au_5um_A12"
    )


def test_target_wiki_ref_is_passed_through_verbatim(tmp_path: Path):
    """target_wiki_ref/page are pure pass-throughs from producer metadata.

    Neither the API nor the frontend builds these URLs by concatenation, so a
    producer-supplied, already-percent-encoded URL (real Ionen: titles contain
    "%" and commas) must survive unchanged — no re-encoding, no decoding.
    """
    encoded_ref = (
        "https://athene.fz-rossendorf.de/fwk/index.php?title=Ionen:0.4%25Formvar092022"
    )
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": "hzdr-local",
                    "title": "HZDR local file fixture",
                    "damnit_path": "damnit/hzdr-local",
                    "metadata": {},
                    "shots": [
                        {
                            "source_key": "hzdr-local",
                            "shot_number": 1001,
                            "fired_at": "2026-05-05T08:15:00Z",
                            "metadata": {
                                "target": {
                                    "name": "0.4% Formvar",
                                    "provenance": "wiki",
                                    "wiki_page": "Ionen:0.4%Formvar092022",
                                    "wiki_ref": encoded_ref,
                                }
                            },
                        }
                    ],
                }
            ]
        })
    )

    shot = load_sources_file(path)[0].shots[0]

    assert shot.target_wiki_page == "Ionen:0.4%Formvar092022"
    assert shot.target_wiki_ref == encoded_ref
    assert shot.model_dump(mode="json")["target_wiki_ref"] == encoded_ref


def test_staged_event_count_excludes_synthetic_labfrog_rows(tmp_path: Path):
    """staged_event_count is a Flow Monitor status number: every shot's own
    synthetic LabFrog row should not inflate it, but real producer events
    (attached or still pending review) should."""
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": "hzdr-local",
                    "title": "HZDR local file fixture",
                    "damnit_path": "damnit/hzdr-local",
                    "metadata": {},
                    "shots": [
                        {
                            "source_key": "hzdr-local",
                            "shot_number": 1,
                            "fired_at": "2026-05-05T08:15:00Z",
                            "metadata": {},
                            "events": [
                                {
                                    "event_id": "labfrog-1",
                                    "source": "LabFrog",
                                    "kind": "shotsheet.row",
                                    "timestamp": "2026-05-05T08:15:00Z",
                                    "payload_ref": {},
                                    "metadata": {},
                                },
                                {
                                    "event_id": "laser-1",
                                    "source": "LaserData",
                                    "kind": "pulse_energy_j",
                                    "timestamp": "2026-05-05T08:15:01Z",
                                    "payload_ref": {},
                                    "metadata": {},
                                },
                            ],
                        }
                    ],
                    "review_events": [
                        {
                            "event_id": "evt-unmatched-1",
                            "experiment_id": "exp",
                            "source": "DAQ-File-Watchdog",
                            "kind": "watchdog.tps",
                            "timestamp": "2026-05-05T09:45:00Z",
                            "payload_ref": {},
                            "metadata": {},
                            "match_status": "unmatched",
                        }
                    ],
                }
            ]
        })
    )

    sources = load_sources_file(path)

    # 1 matched LaserData event + 1 pending review event = 2; the synthetic
    # LabFrog row on the shot is not counted.
    assert sources[0].staged_event_count == 2


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


def test_local_provider_can_lookup_shot_by_date_scoped_key(tmp_path: Path):
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": "hzdr-local",
                    "title": "HZDR local file fixture",
                    "damnit_path": "damnit/hzdr-local",
                    "metadata": {},
                    "shots": [
                        {
                            "source_key": "hzdr-local",
                            "shot_number": 1,
                            "shot_key": "exp:20260505:000001",
                            "fired_at": "2026-05-05T08:15:00Z",
                            "metadata": {},
                        },
                        {
                            "source_key": "hzdr-local",
                            "shot_number": 1,
                            "shot_key": "exp:20260506:000001",
                            "fired_at": "2026-05-06T08:15:00Z",
                            "metadata": {},
                        },
                    ],
                }
            ]
        })
    )
    settings = MetadataSettings(provider="local", sources_file=path)

    detail = HZDRSourceProvider(settings).get_shot_detail_by_key(
        "hzdr-local", "exp:20260506:000001"
    )

    assert detail is not None
    assert detail.shot.fired_at == "2026-05-06T08:15:00Z"


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
        event_source="DAQ-File-Watchdog",
        event_kind="watchdog_shot_event",
        action="enrich",
    )

    assert source.shots[-1].metadata["emulated_last_enrichment_source"] == (
        "DAQ-File-Watchdog"
    )
    event_path = tmp_path / "events" / "daq-file-watchdog.jsonl"
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


def test_flow_monitor_emulator_emits_namespaced_bare_keys(tmp_path: Path):
    """The emulator must emit registry keys, not legacy suffixed ones.

    Characterization test for Phase 1 of
    hzdr/docs/plans/alignment-implementation-plan.md:
    `_build_flow_monitor_metadata` (via `append_emulated_shot`) writes numeric
    laser/vacuum/target fields under the namespaced bare-key convention (see
    CLAUDE.md "Metadata key registry"), and the warn-only legacy-key linter
    must be silent on its output.
    """
    sources_file = write_source_fixture(tmp_path)

    source = append_emulated_shot(
        sources_file,
        source_key="hzdr-local",
        event_source="LaserData",
        event_kind="laser.pulse",
        action="append",
    )

    metadata = source.shots[-1].metadata
    assert "laser_energy_j" not in metadata
    assert "chamber_pressure_mbar" not in metadata
    assert "sample_temperature_c" not in metadata
    assert "pulse_width_fs" not in metadata
    assert "beam_position_x_mm" not in metadata
    assert "beam_position_y_mm" not in metadata

    assert isinstance(metadata["laser"], dict)
    assert isinstance(metadata["laser"]["pulse_energy"], float)
    assert isinstance(metadata["vacuum"], dict)
    assert isinstance(metadata["vacuum"]["chamber_pressure"], float)
    assert isinstance(metadata["target"], dict)
    assert metadata["target"]["provenance"] == "manual"
    assert "temperature" in metadata["target"]

    assert lint_metadata_keys(metadata) == []


def test_flow_monitor_emulator_enrich_action_keeps_namespaced_keys(
    tmp_path: Path,
):
    """The `enrich` emulator action must not reintroduce a legacy flat key."""
    sources_file = write_source_fixture(tmp_path)
    append_emulated_shot(
        sources_file,
        source_key="hzdr-local",
        event_source="LaserData",
        event_kind="laser.pulse",
        action="append",
    )

    source = append_emulated_shot(
        sources_file,
        source_key="hzdr-local",
        event_source="LaserData",
        event_kind="laser.pulse",
        action="enrich",
    )

    metadata = source.shots[-1].metadata
    assert "laser_energy_j" not in metadata
    assert isinstance(metadata["laser"], dict)
    assert isinstance(metadata["laser"]["pulse_energy"], float)
    assert lint_metadata_keys(metadata) == []
