import json
import sqlite3
from pathlib import Path

import h5py
import numpy as np
import pytest

from damnit_api.metadata.hzdr_nexus import (
    discover_labfrog_data_products,
    load_normalized_events,
    normalize_processed_trigger_message,
    normalize_watchdog_document,
    read_labfrog_nexus_shots,
    read_labfrog_sqlite_shots,
    reconcile_canonical_shots,
    write_json_atomic,
    write_nexus_bridge,
    write_sources_catalog,
)
from damnit_api.metadata.hzdr_sources import load_sources_file


def write_labfrog_nexus(path: Path) -> None:
    string_dtype = h5py.string_dtype(encoding="utf-8")
    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        shots = entry.create_group("shots")
        shots.create_dataset("shot_index", data=[0, 1])
        shots.create_dataset(
            "record_id", data=np.asarray(["mongo-17", "mongo-18"], dtype=string_dtype)
        )
        shots.create_dataset("shot_number", data=[17, 18])
        shots.create_dataset(
            "shot_date",
            data=np.asarray(["2026-06-10", "2026-06-10"], dtype=string_dtype),
        )
        shots.create_dataset(
            "date_time",
            data=np.asarray(
                ["2026-06-10T12:00:20Z", "2026-06-10T12:01:20Z"],
                dtype=string_dtype,
            ),
        )
        shots.create_dataset(
            "campaign", data=np.asarray(["HELPMI", "HELPMI"], dtype=string_dtype)
        )
        entry.create_group("raw_labfrog").create_dataset("kept", data=[1, 2])
        derived = entry.create_group("derived")
        charge = derived.create_dataset("ict_charge", data=[1.2, 1.4])
        charge.attrs["units"] = "nC"


def normalized_event(**overrides):
    event = {
        "experiment_id": "HELPMI",
        "shot_id": "shot-000017",
        "source": "LaserData",
        "kind": "camera_raw",
        "timestamp": "2026-06-10T12:00:00Z",
        "transport": "asapo",
        "payload_ref": {"message_id": 17},
        "values": [[1.0, 2.0], [3.0, 4.0]],
        "metadata": {"unit": "count"},
    }
    event.update(overrides)
    return event


def test_preserves_rich_labfrog_nexus_and_adds_damnit_bridge(tmp_path: Path):
    labfrog_nexus = tmp_path / "labfrog.nxs"
    output_nexus = tmp_path / "canonical.nxs"
    sources_file = tmp_path / "hzdr_sources.json"
    write_labfrog_nexus(labfrog_nexus)

    labfrog_shots = read_labfrog_nexus_shots(labfrog_nexus)
    shots, events = reconcile_canonical_shots(
        [normalized_event()],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=labfrog_shots,
    )
    products = discover_labfrog_data_products(labfrog_nexus, shots)
    for product in products:
        shots[product["metadata"]["shot_index"]]["data_products"].append(product)

    write_nexus_bridge(
        output_path=output_nexus,
        source_nexus=labfrog_nexus,
        experiment_id="HELPMI",
        shots=shots,
        events=events,
    )
    write_sources_catalog(
        sources_file=sources_file,
        source_key="hzdr-labfrog",
        experiment_id="HELPMI",
        nexus_path=output_nexus,
        shots=shots,
    )

    with h5py.File(output_nexus, "r") as handle:
        assert list(handle["entry/raw_labfrog/kept"][...]) == [1, 2]
        assert handle["entry/shots/shot_key"].asstr()[0] == ("HELPMI:20260610:000017")
        assert handle["entry/shots/match_quality"].asstr()[0] == (
            "exact_day_shot_number"
        )
        assert handle["entry/source_events/shot_key"].asstr()[0] == (
            "HELPMI:20260610:000017"
        )
        assert "entry/data_products/dataset_path" in handle
        assert (f"entry/laserdata/camera_raw/{events[0]['event_id']}/values") in handle

    sources = load_sources_file(sources_file)
    shot = sources[0].shots[0]
    assert shot.labfrog_record_id == "mongo-17"
    assert shot.events[0].source == "LaserData"
    assert {product.source for product in shot.data_products} == {
        "LabFrog",
        "LaserData",
    }
    # "last rebuild" timestamp, surfaced for the Flow Monitor status panel
    assert "catalog_built_at" in sources[0].metadata


def test_ambiguous_labfrog_match_is_not_silently_assigned():
    duplicate_rows = [
        {
            "record_id": "a",
            "shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:20Z",
            "metadata": {},
        },
        {
            "record_id": "b",
            "shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:30Z",
            "metadata": {},
        },
    ]

    shots, events = reconcile_canonical_shots(
        [normalized_event()],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=duplicate_rows,
    )

    assert events[0]["match_status"] == "ambiguous"
    assert events[0]["shot_key"] == ""
    assert all(
        all(event["source"] == "LabFrog" for event in shot["events"]) for shot in shots
    )


def test_naive_labfrog_time_uses_campaign_timezone_for_timestamp_match():
    labfrog_shots = [
        {
            "record_id": "local-time-shot",
            "shot_number": 1,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:00",
            "metadata": {},
        }
    ]

    shots, events = reconcile_canonical_shots(
        [
            normalized_event(
                shot_id="shot-000001",
                shot_number=1,
                timestamp="2026-06-10T10:00:00Z",
            )
        ],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=labfrog_shots,
        campaign_timezone="Europe/Berlin",
    )

    assert events[0]["match_quality"] == "exact_day_shot_number"
    assert events[0]["match_time_delta_s"] == 0
    assert shots[0]["shot_key"] == "HELPMI:20260610:000001"


def test_repeated_shot_numbers_are_scoped_by_campaign_date():
    labfrog_shots = [
        {
            "record_id": "day-one",
            "shot_number": 1,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T09:00:00+02:00",
            "metadata": {},
        },
        {
            "record_id": "day-two",
            "shot_number": 1,
            "shot_date": "2026-06-11",
            "labfrog_date_time": "2026-06-11T09:00:00+02:00",
            "metadata": {},
        },
    ]

    shots, events = reconcile_canonical_shots(
        [
            normalized_event(
                shot_id="shot-000001",
                shot_number=1,
                timestamp="2026-06-11T07:00:01Z",
            )
        ],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=labfrog_shots,
        campaign_timezone="Europe/Berlin",
    )

    assert events[0]["shot_key"] == "HELPMI:20260611:000001"
    assert [shot["shot_key"] for shot in shots] == [
        "HELPMI:20260610:000001",
        "HELPMI:20260611:000001",
    ]


def test_labfrog_version_history_matches_only_current_record(tmp_path: Path):
    version_rows = [
        {
            "record_id": "old",
            "shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:10Z",
            "metadata": {"has_newer_version": True},
        },
        {
            "record_id": "current",
            "shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:20Z",
            "metadata": {"has_newer_version": False},
        },
    ]

    shots, events = reconcile_canonical_shots(
        [normalized_event()],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=version_rows,
    )

    assert events[0]["match_status"] == "matched"
    assert [event["source"] for event in shots[0]["events"]] == ["LabFrog"]
    assert [event["source"] for event in shots[1]["events"]] == [
        "LaserData",
        "LabFrog",
    ]

    sources_file = tmp_path / "hzdr_sources.json"
    write_sources_catalog(
        sources_file=sources_file,
        source_key="hzdr-labfrog",
        experiment_id="HELPMI",
        nexus_path=tmp_path / "HELPMI.nxs",
        shots=shots,
    )
    source = load_sources_file(sources_file)[0]
    assert [shot.labfrog_record_id for shot in source.shots] == ["current"]


def test_reads_labfrog_sqlite_canonical_shot_columns(tmp_path: Path):
    sqlite_path = tmp_path / "campaign.sqlite"
    with sqlite3.connect(sqlite_path) as connection:
        connection.execute(
            """
            CREATE TABLE shots (
                mongo_id TEXT PRIMARY KEY,
                shot_number INTEGER,
                date_time TEXT,
                campaign TEXT,
                status TEXT,
                version INTEGER
            )
            """
        )
        connection.execute(
            "INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?)",
            (
                "mongo-17",
                17,
                "2026-06-10T12:00:20Z",
                "HELPMI",
                "active",
                2,
            ),
        )

    shots = read_labfrog_sqlite_shots(sqlite_path)

    assert shots == [
        {
            "record_index": 0,
            "record_id": "mongo-17",
            "shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:20Z",
            "campaign": "HELPMI",
            "metadata": {"status": "active", "version": 2},
        }
    ]


def test_adapts_planet_watchdog_processed_document():
    event = normalize_watchdog_document(
        {
            "watch": {"watch_name": "TPS results"},
            "event": {
                "filename": "shot-17.csv",
                "filepath": "Z:/data/shot-17.csv",
                "timestamp": "2026-06-10T12:00:01Z",
            },
            "analysis": {"data": {"shot": "17", "energy": "8.2"}},
            "zmq_data": [{"topic": "Draco01", "payload": {"shot": 17}}],
            "_kafka": {"topic": "planet.watchdog.events", "offset": 42},
        },
        experiment_id="HELPMI",
    )

    assert event["shot_id"] == "shot-000017"
    assert event["source"] == "PLANET-Watchdog"
    assert event["kind"] == "watchdog.TPS_results"
    assert event["payload_ref"]["filepath"] == "Z:/data/shot-17.csv"
    assert event["payload_ref"]["offset"] == 42


def test_adapts_legacy_processed_trigger_without_inventing_shot_number():
    event = normalize_processed_trigger_message({
        "processed_message": {
            "Name": "Draco01",
            "Nickname": "trigger_shot_HELPMI",
            "Trigger_threshold": 0.25,
            "ADC_value": 0.81,
            "Channel_counter": 17,
            "Run_id": 4,
            "Event_timestamp": "2026-06-10T12:00:00+00:00",
            "10Hz_counter": 9012,
            "Campaign": "HELPMI",
        },
        "_kafka": {
            "topic": "Draco01",
            "partition": 0,
            "offset": 42,
            "key": "processed_message",
        },
    })

    assert event["experiment_id"] == "HELPMI"
    assert event["source"] == "DRACO-Trigger"
    assert event["kind"] == "trigger.threshold_crossing"
    assert event["shot_id"].startswith("unassigned-")
    assert "shot_number" not in event
    assert event["values"] == [0.81]
    assert event["metadata"]["trigger"] == {
        "channel_id": "Draco01",
        "nickname": "trigger_shot_HELPMI",
        "role": "threshold_crossing",
        "threshold": 0.25,
        "comparison": ">",
        "adc_value": 0.81,
        "adc_unit": None,
        "channel_trigger_count": 17,
        "acquisition_run_id": 4,
        "sample_counter_10hz": 9012,
    }


def test_processed_trigger_uses_only_explicit_shot_number():
    event = normalize_processed_trigger_message({
        "processed_message": {
            "Name": "Draco02",
            "Nickname": "main_shot_trigger",
            "Trigger_role": "shot_trigger",
            "ADC_value": 0.91,
            "Channel_counter": 88,
            "Run_id": 4,
            "Event_timestamp": "2026-06-10T12:00:00Z",
            "10Hz_counter": 9012,
            "Campaign": "HELPMI",
            "shot_number": 17,
        }
    })

    assert event["shot_number"] == 17
    assert event["shot_id"] == "shot-000017"
    assert event["kind"] == "trigger.shot_trigger"


def test_duplicate_event_id_is_kept_once_not_double_counted():
    """A staged JSONL line appended twice (producer retry, emulator re-run,
    at-least-once transport) must not double-count or duplicate the event."""
    event = normalized_event()
    shots, events = reconcile_canonical_shots(
        [event, dict(event)],  # same event, appended twice
        experiment_id="HELPMI",
        source_key="hzdr-laserdata",
    )

    assert len(events) == 1
    assert len(shots) == 1
    assert len(shots[0]["events"]) == 1


def test_duplicate_event_id_across_separate_jsonl_files_is_deduplicated(
    tmp_path: Path,
):
    """The same event re-appended to a JSONL file (e.g. after a restart that
    replays unacknowledged lines) collapses to one event end-to-end through
    load_normalized_events, not just within a single in-memory list."""
    jsonl_path = tmp_path / "laserdata.jsonl"
    event = normalized_event()
    with jsonl_path.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(event) + "\n")
        handle.write(json.dumps(event) + "\n")  # duplicate line

    loaded = load_normalized_events([jsonl_path])
    assert len(loaded) == 2  # load_normalized_events itself does not dedupe

    shots, events = reconcile_canonical_shots(
        loaded, experiment_id="HELPMI", source_key="hzdr-laserdata"
    )
    # reconcile_canonical_shots is where deduplication actually happens
    assert len(events) == 1
    assert len(shots) == 1


def test_load_normalized_events_reports_corrupt_jsonl_line_and_path(tmp_path: Path):
    jsonl_path = tmp_path / "broken.jsonl"
    jsonl_path.write_text(
        json.dumps(normalized_event()) + "\n" + "{not valid json\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match=r"broken\.jsonl:2 is not valid JSON"):
        load_normalized_events([jsonl_path])


def test_load_normalized_events_reports_corrupt_json_file(tmp_path: Path):
    json_path = tmp_path / "broken.json"
    json_path.write_text("{not valid json", encoding="utf-8")

    with pytest.raises(ValueError, match=r"broken\.json is not valid JSON"):
        load_normalized_events([json_path])


def test_write_json_atomic_never_leaves_a_partial_file_on_failure(tmp_path: Path):
    """If serialization fails partway, the existing target file must be left
    untouched - not truncated or replaced by a half-written temp file."""
    target = tmp_path / "hzdr_sources.json"
    target.write_text('{"sources": []}', encoding="utf-8")

    class Unserializable:
        def __repr__(self):
            return "<unserializable>"

    with pytest.raises(TypeError):
        write_json_atomic(target, {"sources": [Unserializable()]})

    # original file is untouched, and no stray .tmp file was left behind
    assert target.read_text(encoding="utf-8") == '{"sources": []}'
    assert list(tmp_path.glob("*.tmp")) == []


def test_write_json_atomic_replaces_existing_file_contents(tmp_path: Path):
    target = tmp_path / "hzdr_sources.json"
    target.write_text('{"sources": ["old"]}', encoding="utf-8")

    write_json_atomic(target, {"sources": ["new"]})

    assert json.loads(target.read_text(encoding="utf-8")) == {"sources": ["new"]}
    assert list(tmp_path.glob("*.tmp")) == []
