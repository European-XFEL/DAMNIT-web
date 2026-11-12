from datetime import datetime
from pathlib import Path

import h5py
import numpy as np
import orjson
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from damnit_api.metadata.hzdr_event import (
    UNASSIGNED_EXPERIMENT_ID,
    HZDREventV1,
    lint_metadata_keys,
)
from damnit_api.metadata.hzdr_nexus import (
    load_campaign_schedule,
    load_normalized_events,
    reconcile_canonical_shots,
)
from damnit_api.metadata.hzdr_routers import append_emulated_shot, hzdr_router
from damnit_api.metadata.hzdr_sources import (
    HZDRShot,
    HZDRSourceProvider,
    _map_mongo_shot,
    list_hdf5_datasets,
    load_sources_file,
    preview_hdf5_dataset,
)
from damnit_api.shared.settings import MetadataSettings
from damnit_api.shared.settings import settings as app_settings


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


@pytest.mark.parametrize(
    ("shot_key", "expected"),
    [
        (None, 5.0),
        ("exp:20260505:000001", 5.0),
        ("exp:20260506:000001", 6.0),
        ("missing", None),
    ],
)
def test_dataset_preview_selects_date_scoped_shot(
    tmp_path: Path, monkeypatch, shot_key: str | None, expected: float | None
):
    shots = []
    for day in (5, 6):
        path = tmp_path / f"day-{day}.h5"
        with h5py.File(path, "w") as handle:
            handle.create_dataset("signal", data=float(day))
        shots.append({
            "source_key": "hzdr-local",
            "shot_number": 1,
            "shot_key": f"exp:202605{day:02d}:000001",
            "fired_at": f"2026-05-{day:02d}T08:15:00Z",
            "hdf5_path": str(path),
        })
    sources = tmp_path / "hzdr_sources.json"
    sources.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": "hzdr-local",
                    "title": "Repeated shot numbers",
                    "damnit_path": "damnit/hzdr-local",
                    "shots": shots,
                }
            ]
        })
    )
    monkeypatch.setattr(
        app_settings,
        "metadata",
        MetadataSettings(provider="local", sources_file=sources),
    )
    app = FastAPI()
    app.include_router(hzdr_router)
    with TestClient(app) as client:
        response = client.get(
            "/metadata/hzdr/sources/hzdr-local/shots/1/datasets/signal",
            params={"shot_key": shot_key} if shot_key is not None else {},
        )
    assert response.status_code == 200
    if expected is None:
        assert response.json() is None
    else:
        assert response.json()["preview"] == expected


def test_labfrog_local_count_is_a_shot_field_not_metadata():
    """Bridge v5: the catalog's labfrog_local_count reaches HZDRShot as a field."""
    record = {
        "shot_number": 5,
        "fired_at": "2026-10-01T10:00:00Z",
        "labfrog_local_count": 7,
    }
    shot = _map_mongo_shot(
        record, "hzdr-local", shot_number_field="shot_number", fired_at_field="fired_at"
    )
    assert shot is not None
    assert shot.labfrog_local_count == 7
    assert "labfrog_local_count" not in shot.metadata
    assert shot.shot_number == 5  # the governed number is untouched

    for missing in (
        {},
        {"labfrog_local_count": None},
        {"labfrog_local_count": -1},
        {"labfrog_local_count": True},
    ):
        other = _map_mongo_shot(
            {"shot_number": 6, "fired_at": "x", **missing},
            "hzdr-local",
            shot_number_field="shot_number",
            fired_at_field="fired_at",
        )
        assert other is not None
        assert other.labfrog_local_count is None

    validated = HZDRShot.model_validate({
        "source_key": "s",
        "shot_number": 1,
        "fired_at": "x",
        "labfrog_local_count": 8,
    })
    assert validated.labfrog_local_count == 8


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


def test_watchdog_flow_monitor_event_is_the_watchdogs_envelope(tmp_path: Path):
    """A watchdog enrichment is the event a DAQ File Watchdog PC sends.

    Flow mesh plan M9: attributed to the shot, campaign left to DAMNIT, and
    the registered instrument/attribution/acquisition/producer metadata.
    """
    sources_file = write_source_fixture(tmp_path)

    source = append_emulated_shot(
        sources_file,
        source_key="hzdr-local",
        event_source="DAQ-File-Watchdog",
        event_kind="watchdog_shot_event",
        action="enrich",
    )

    shot = source.shots[-1]
    assert shot.metadata["emulated_last_enrichment_source"] == "DAQ-File-Watchdog"
    event_path = tmp_path / "events" / "daq-file-watchdog.jsonl"
    event = orjson.loads(event_path.read_bytes().splitlines()[-1])
    assert HZDREventV1.model_validate(event).event_id.startswith("watchdog-")
    assert event["experiment_id"] == UNASSIGNED_EXPERIMENT_ID
    assert event["shot_number"] == shot.shot_number
    assert event["shot_id"] == f"shot-{shot.shot_number:06d}"
    assert event["kind"] == "watchdog.M1_Spec_Fib_Cer"
    assert event["transport"] == "kafka"
    assert event["values"] is None
    assert event["payload_ref"]["topic"] == "planet.watchdog.events"
    assert event["payload_ref"]["path"].endswith(event["payload_ref"]["filename"])
    metadata = event["metadata"]
    assert metadata["watch"]["watch_name"] == "M1_Spec_Fib_Cer"
    assert metadata["watch"]["configured_experiment_id"] == "exp-emulated"
    assert metadata["instrument"] == {
        "id": "m1_spec_fib_cer",
        "group": "ions",
        "timing_role": "on_shot",
        "format": "camera_png_csv",
        "record_source": "catalogue",
    }
    assert metadata["attribution"]["status"] == "attributed"
    assert metadata["attribution"]["method"] == "trigger_window"
    assert metadata["attribution"]["candidates"] == [shot.shot_number]
    assert metadata["acquisition"]["time_source"] == "first_seen"
    assert metadata["producer"]["instance_id"] == "watchdog-ions-01"
    assert lint_metadata_keys(metadata) == []


def test_watchdog_flow_monitor_events_on_one_shot_have_their_own_ids(tmp_path: Path):
    """Two files of one shot are two events; a replay would resend each id."""
    sources_file = write_source_fixture(tmp_path)
    for _ in range(2):
        append_emulated_shot(
            sources_file,
            source_key="hzdr-local",
            event_source="DAQ-File-Watchdog",
            event_kind="watchdog.M1_Spec_Fib_Cer",
            action="enrich",
        )

    event_path = tmp_path / "events" / "daq-file-watchdog.jsonl"
    events = [orjson.loads(line) for line in event_path.read_bytes().splitlines()]
    assert len({event["event_id"] for event in events}) == 2
    assert [event["payload_ref"]["offset"] for event in events] == [1, 2]


@pytest.mark.parametrize(
    ("source", "kind"),
    [
        ("DRACO-Trigger", "trigger.threshold_crossing"),
        # The request name older frontends send: the same trigger.
        ("Shotcounter", "shot_counter_event"),
    ],
)
def test_trigger_flow_monitor_event_is_the_shot_authoritys_envelope(
    tmp_path: Path, source: str, kind: str
):
    """A new shot starts with the shot authority's ``draco.trigger`` event.

    Flow mesh plan M9 (contradictions X13/X14): the authority issues the
    number and names no campaign; DAMNIT resolves the campaign.
    """
    sources_file = write_source_fixture(tmp_path)

    result = append_emulated_shot(
        sources_file,
        source_key="hzdr-local",
        event_source=source,
        event_kind=kind,
        action="append",
    )

    shot = result.shots[-1]
    assert shot.metadata["emulated_source"] == "DRACO-Trigger"
    assert shot.metadata["emulated_kind"] == "trigger.threshold_crossing"
    assert shot.metadata["shotcounter_status"] == "shot-opened"
    # The campaign was not the producer's to name.
    assert shot.experiment_id_source == "schedule"
    assert not (tmp_path / "events" / "shotcounter.jsonl").exists()
    event_path = tmp_path / "events" / "draco-trigger.jsonl"
    event = orjson.loads(event_path.read_bytes().splitlines()[-1])
    HZDREventV1.model_validate(event)
    assert event["source"] == "DRACO-Trigger"
    assert event["kind"] == "trigger.threshold_crossing"
    assert event["experiment_id"] == UNASSIGNED_EXPERIMENT_ID
    assert event["shot_number"] == shot.shot_number
    assert event["shot_id"] == f"shot-{shot.shot_number:06d}"
    assert event["transport"] == "kafka"
    assert event["values"] is None
    assert event["payload_ref"] == {
        "channel_id": "Draco01",
        "run_id": 3,
        "topic": "draco.trigger",
        "partition": 0,
        "offset": 3,
    }
    assert event["metadata"]["trigger"]["role"] == "threshold_crossing"
    assert event["metadata"]["trigger"]["channel_id"] == "Draco01"
    assert set(event["metadata"]) == {"trigger", "shot_authority"}


def test_emulated_trigger_and_watchdog_events_build_one_shot(tmp_path: Path):
    """The builder resolves both emulated events to one shot of the campaign."""
    sources_file = write_source_fixture(tmp_path)
    for source, action in (
        ("DRACO-Trigger", "append"),
        ("DAQ-File-Watchdog", "enrich"),
    ):
        append_emulated_shot(
            sources_file,
            source_key="hzdr-local",
            event_source=source,
            event_kind="",
            action=action,
        )
    events = load_normalized_events(sorted((tmp_path / "events").glob("*.jsonl")))
    trigger_time = datetime.fromisoformat(events[0]["timestamp"])
    schedule = {
        "schema": "labfrog-campaign-schedule-v1",
        "timezone": "UTC",
        "campaigns": [
            {
                "campaign": "exp-emulated",
                "experiment_id": "exp-emulated",
                "start": trigger_time.date().isoformat(),
                "end": trigger_time.date().isoformat(),
                "source": "emulated",
            }
        ],
        "warnings": [],
    }
    schedule_path = tmp_path / "schedule.json"
    schedule_path.write_bytes(orjson.dumps(schedule))

    shots, built_events = reconcile_canonical_shots(
        events,
        experiment_id="exp-emulated",
        source_key="hzdr-local",
        campaign_schedule=load_campaign_schedule(schedule_path),
        campaign_timezone="UTC",
    )

    assert len(shots) == 1
    assert shots[0]["experiment_id_source"] == "schedule"
    assert {event["source"] for event in shots[0]["events"]} == {
        "DRACO-Trigger",
        "DAQ-File-Watchdog",
    }
    assert {event["experiment_id"] for event in built_events} == {"exp-emulated"}


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
    # The fixed laser-system constants a real LaserData producer repeats on
    # every shot (standards-alignment.md §3.3/§3.10).
    assert metadata["laser"]["wavelength"] == pytest.approx(800.0)
    assert metadata["laser"]["repetition_rate"] == pytest.approx(1.0)
    assert metadata["laser"]["polarization"] == "p"
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


def _provider_with_recorded_path(tmp_path: Path, recorded: str, path_map: str):
    """A one-shot source whose hdf5_path is a path this host cannot open as-is."""
    sources = tmp_path / "hzdr_sources.json"
    sources.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": "hzdr-local",
                    "title": "path map fixture",
                    "damnit_path": "damnit/hzdr-local",
                    "shots": [
                        {
                            "source_key": "hzdr-local",
                            "shot_number": 1,
                            "fired_at": "2026-05-05T08:15:00Z",
                            "hdf5_path": recorded,
                        }
                    ],
                }
            ]
        })
    )
    return HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=sources, path_map=path_map)
    )


@pytest.mark.parametrize(
    "recorded", ["/bigdata/HPLexp/shot.h5", "Z:/bigdata/HPLexp/shot.h5"]
)
def test_recorded_bigdata_paths_resolve_through_the_path_map(
    tmp_path: Path, recorded: str
):
    mount = tmp_path / "mnt" / "bigdata"
    (mount / "HPLexp").mkdir(parents=True)
    with h5py.File(mount / "HPLexp" / "shot.h5", "w") as handle:
        handle.create_dataset("signal", data=np.asarray([1.0, 1.5]))
    provider = _provider_with_recorded_path(
        tmp_path, recorded, f"/bigdata={mount},Z:/bigdata={mount}"
    )

    detail = provider.get_shot_detail("hzdr-local", 1)
    preview = provider.get_dataset_preview("hzdr-local", 1, "signal")

    assert detail.hdf5_exists is True
    assert [dataset.name for dataset in detail.hdf5_datasets] == ["signal"]
    assert preview.preview == [1.0, 1.5]


def test_recorded_path_without_a_map_is_looked_up_as_recorded(tmp_path: Path):
    provider = _provider_with_recorded_path(tmp_path, "/bigdata/HPLexp/shot.h5", "")

    detail = provider.get_shot_detail("hzdr-local", 1)

    assert detail.hdf5_exists is False
    assert provider.get_dataset_preview("hzdr-local", 1, "signal") is None


def test_malformed_path_map_is_refused_when_the_provider_is_built(tmp_path: Path):
    with pytest.raises(ValueError, match="path map"):
        _provider_with_recorded_path(tmp_path, "/bigdata/x.h5", "not-a-rule")


def _provider_with_products(tmp_path: Path, products: list[dict], path_map: str):
    sources = tmp_path / "hzdr_sources.json"
    sources.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": "hzdr-local",
                    "title": "data product fixture",
                    "damnit_path": "damnit/hzdr-local",
                    "shots": [
                        {
                            "source_key": "hzdr-local",
                            "shot_number": 1,
                            "fired_at": "2026-05-05T08:15:00Z",
                            "data_products": products,
                        }
                    ],
                }
            ]
        })
    )
    return HZDRSourceProvider(
        MetadataSettings(provider="local", sources_file=sources, path_map=path_map)
    )


def test_shot_detail_reports_which_data_product_files_are_reachable(
    tmp_path: Path,
):
    """Each referenced file is checked on this host, through the path map."""
    mount = tmp_path / "mnt" / "bigdata"
    (mount / "cam").mkdir(parents=True)
    (mount / "cam" / "frame.png").write_bytes(b"png")
    products = [
        {
            "product_id": "on-disk",
            "source": "cam",
            "kind": "file",
            "path": "Z:/bigdata/cam/frame.png",
        },
        {
            "product_id": "missing",
            "source": "cam",
            "kind": "file",
            "path": "/bigdata/cam/gone.png",
        },
        {
            "product_id": "remote",
            "source": "cam",
            "kind": "file",
            "path": "https://example.org/frame.png",
        },
        {
            "product_id": "inline",
            "source": "cam",
            "kind": "hdf5_dataset",
            "dataset_name": "/entry/cam/values",
        },
    ]
    provider = _provider_with_products(
        tmp_path, products, f"/bigdata={mount},Z:/bigdata={mount}"
    )

    detail = provider.get_shot_detail("hzdr-local", 1)

    reachable = {p.product_id: p.reachable for p in detail.shot.data_products}
    assert reachable == {
        "on-disk": True,
        "missing": False,
        "remote": None,
        "inline": None,
    }
    # The detail is a view: the stored record keeps the recorded path as-is.
    stored = provider.list_shots("hzdr-local")[0].data_products[0]
    assert stored.path == "Z:/bigdata/cam/frame.png"
    assert stored.reachable is None
