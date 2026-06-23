import json
import os
import sqlite3
from pathlib import Path

import h5py
import numpy as np
import pytest

from damnit_api.metadata.hzdr_nexus import (
    BuilderAlreadyRunningError,
    append_review_decision,
    discover_labfrog_data_products,
    load_normalized_events,
    load_review_decisions,
    normalize_processed_trigger_message,
    normalize_watchdog_document,
    read_labfrog_nexus_shots,
    read_labfrog_sqlite_shots,
    reconcile_canonical_shots,
    review_sidecar_path,
    single_writer_lock,
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


def test_duplicate_tango_shot_number_uses_timestamp_disambiguation():
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
            "labfrog_date_time": "2026-06-10T12:00:45Z",
            "metadata": {},
        },
    ]

    shots, events = reconcile_canonical_shots(
        [normalized_event(timestamp="2026-06-10T12:00:42Z")],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=duplicate_rows,
    )

    assert events[0]["match_status"] == "matched"
    assert events[0]["match_quality"] == "exact_day_shot_number_time_window"
    matched = next(shot for shot in shots if shot["match_status"] == "matched")
    assert matched["labfrog_record_id"] == "b"


def test_ambiguous_labfrog_match_is_not_silently_assigned():
    duplicate_rows = [
        {
            "record_id": "a",
            "shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T11:59:40Z",
            "metadata": {},
        },
        {
            "record_id": "b",
            "shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:20Z",
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


def test_kafka_event_id_takes_priority_over_shot_number_and_timestamp():
    labfrog_shots = [
        {
            "record_id": "identity-match",
            "shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:20Z",
            "metadata": {"kafka_event_id": "evt-shotcounter-17"},
        },
        {
            "record_id": "timestamp-decoy",
            "shot_number": 18,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:10:00Z",
            "metadata": {},
        },
    ]

    shots, events = reconcile_canonical_shots(
        [
            normalized_event(
                event_id="evt-shotcounter-17",
                shot_id="shot-000018",
                shot_number=18,
                timestamp="2026-06-10T12:10:01Z",
                payload_ref={"topic": "shotcounter.shots", "partition": 0, "offset": 4},
            )
        ],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=labfrog_shots,
    )

    assert events[0]["match_quality"] == "exact_kafka_event_id"
    matched = next(shot for shot in shots if shot["match_status"] == "matched")
    assert matched["labfrog_record_id"] == "identity-match"


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


def test_reads_curated_sqlite_linking_columns_and_marks_history(tmp_path: Path):
    sqlite_path = tmp_path / "campaign.sqlite"
    with sqlite3.connect(sqlite_path) as connection:
        connection.execute(
            """
            CREATE TABLE shots (
                mongo_id TEXT PRIMARY KEY,
                shot_number INTEGER,
                date_time TEXT,
                campaign TEXT,
                experiment_id TEXT,
                status TEXT,
                version INTEGER,
                kafka_topic TEXT,
                kafka_partition INTEGER,
                kafka_offset INTEGER,
                kafka_key TEXT,
                kafka_event_id TEXT,
                kafka_experiment_id TEXT,
                kafka_shot_number INTEGER,
                kafka_timestamp TEXT,
                kafka_source TEXT,
                damnit_shot_key TEXT,
                damnit_match_quality TEXT
            )
            """
        )
        connection.executemany(
            "INSERT INTO shots VALUES "
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    "mongo-old",
                    17,
                    "2026-06-10T12:00:20",
                    "HELPMI Campaign",
                    "HELPMI",
                    "archived",
                    1,
                    "shotcounter.shots",
                    0,
                    41,
                    "HELPMI:Draco01",
                    "evt-old",
                    "HELPMI",
                    17,
                    "2026-06-10T10:00:20Z",
                    "shotcounter",
                    None,
                    None,
                ),
                (
                    "mongo-current",
                    17,
                    "2026-06-10T12:00:21",
                    "HELPMI Campaign",
                    "HELPMI",
                    "active",
                    2,
                    "shotcounter.shots",
                    0,
                    42,
                    "HELPMI:Draco01",
                    "evt-current",
                    "HELPMI",
                    17,
                    "2026-06-10T10:00:21Z",
                    "shotcounter",
                    "HELPMI:20260610:000017",
                    "exact_kafka_event_id",
                ),
            ],
        )

    shots = read_labfrog_sqlite_shots(sqlite_path)

    assert shots[0]["metadata"]["has_newer_version"] is True
    assert shots[1]["metadata"]["has_newer_version"] is False
    assert shots[1]["experiment_id"] == "HELPMI"
    # experiment_id lives only at the top level now, not duplicated in metadata.
    assert "experiment_id" not in shots[1]["metadata"]
    assert shots[1]["metadata"]["kafka_event_id"] == "evt-current"
    assert shots[1]["metadata"]["kafka_topic"] == "shotcounter.shots"
    assert shots[1]["metadata"]["damnit_shot_key"] == "HELPMI:20260610:000017"


def test_active_keyed_supersede_warns_when_active_row_not_latest(
    tmp_path: Path, caplog
):
    """A malformed export marking an older row active still keys on status, but
    the version mismatch is surfaced as a warning rather than failing silently."""
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
        connection.executemany(
            "INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?)",
            [
                # The older row (version 1) is wrongly marked active.
                ("mongo-old", 17, "2026-06-10T12:00:20", "HELPMI", "active", 1),
                ("mongo-new", 17, "2026-06-10T12:00:21", "HELPMI", "archived", 2),
            ],
        )

    with caplog.at_level("WARNING"):
        shots = read_labfrog_sqlite_shots(sqlite_path)

    # Behavior is unchanged: has_newer_version follows status, not version.
    by_id = {shot["record_id"]: shot for shot in shots}
    assert by_id["mongo-old"]["metadata"]["has_newer_version"] is False
    assert by_id["mongo-new"]["metadata"]["has_newer_version"] is True
    # But the version disagreement is logged for operator visibility.
    assert any(
        "non-latest row active" in record.message for record in caplog.records
    )


def test_adapts_planet_watchdog_processed_document():
    event = normalize_watchdog_document(
        {
            "watch": {"watch_name": "TPS results"},
            "event": {
                "filename": "shot-17.csv",
                "filepath": "Z:/data/shot-17.csv",
                "file_uri": "file:///Z:/data/shot-17.csv",
                "timestamp": "2026-06-10T12:00:01Z",
            },
            "analysis": {"data": {"shot": "17", "energy": "8.2"}},
            "zmq_data": [{"topic": "Draco01", "payload": {"shot": 17}}],
            "_id": "mongo-watchdog-17",
            "scicat_pid": "20.500.11935/abc-17",
            "_kafka": {
                "topic": "planet.watchdog.events",
                "partition": 2,
                "offset": 42,
                "key": "watchdog-key-17",
            },
        },
        experiment_id="HELPMI",
    )

    assert event["shot_id"] == "shot-000017"
    assert event["source"] == "PLANET-Watchdog"
    assert event["kind"] == "watchdog.TPS_results"
    assert event["payload_ref"]["path"] == "Z:/data/shot-17.csv"
    assert event["payload_ref"]["filepath"] == "Z:/data/shot-17.csv"
    assert event["payload_ref"]["uri"] == "file:///Z:/data/shot-17.csv"
    assert event["payload_ref"]["topic"] == "planet.watchdog.events"
    assert event["payload_ref"]["partition"] == 2
    assert event["payload_ref"]["offset"] == 42
    assert event["payload_ref"]["message_key"] == "watchdog-key-17"
    assert event["payload_ref"]["mongo_id"] == "mongo-watchdog-17"
    assert event["payload_ref"]["scicat_pid"] == "20.500.11935/abc-17"


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
    assert event["payload_ref"]["topic"] == "Draco01"
    assert event["payload_ref"]["partition"] == 0
    assert event["payload_ref"]["offset"] == 42
    assert event["payload_ref"]["message_key"] == "processed_message"
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


def test_normalize_accepts_flat_hzdr_event_v1_trigger_envelope():
    """Shotcounter's Kafka branch emits a flat hzdr-event-v1 dict with
    trigger_role at top level (not wrapped in processed_message). The normalizer
    must pass it through without re-wrapping and must fold trigger_role into
    metadata.trigger.role."""
    event = normalize_processed_trigger_message({
        "schema_version": "hzdr-event-v1",
        "event_id": "evt-draco-001",
        "experiment_id": "Solenoid_Tests_01",
        "shot_number": 7,
        "source": "DRACO-Trigger",
        "kind": "draco.trigger",
        "trigger_role": "pump",
        "timestamp": "2025-01-16T08:00:00Z",
        "transport": "kafka",
        "payload_ref": {"channel_id": "Draco01", "run_id": 4},
        "values": None,
        "metadata": {"device": "DRACO-01"},
    })

    assert event["schema_version"] == "hzdr-event-v1"
    assert event["event_id"] == "evt-draco-001"
    assert event["experiment_id"] == "Solenoid_Tests_01"
    assert event["shot_number"] == 7
    assert event["shot_id"] == "shot-000007"
    assert event["source"] == "DRACO-Trigger"
    assert event["kind"] == "draco.trigger"
    assert "trigger_role" not in event
    assert event["metadata"]["trigger"]["role"] == "pump"
    assert event["metadata"]["device"] == "DRACO-01"
    assert event["payload_ref"] == {"channel_id": "Draco01", "run_id": 4}


def test_normalize_hzdr_event_v1_overrides_experiment_id():
    event = normalize_processed_trigger_message(
        {
            "schema_version": "hzdr-event-v1",
            "event_id": "evt-draco-002",
            "experiment_id": "Campaign_From_Device",
            "shot_number": 1,
            "source": "DRACO-Trigger",
            "kind": "draco.trigger",
            "trigger_role": "shot",
            "timestamp": "2025-01-16T08:00:00Z",
            "transport": "kafka",
            "payload_ref": {"channel_id": "Draco01", "run_id": 5},
            "values": None,
            "metadata": {},
        },
        experiment_id="Override_From_Builder",
    )

    assert event["experiment_id"] == "Override_From_Builder"


def test_normalize_hzdr_event_v1_without_shot_number():
    event = normalize_processed_trigger_message({
        "schema_version": "hzdr-event-v1",
        "event_id": "evt-draco-003",
        "experiment_id": "Solenoid_Tests_01",
        "source": "DRACO-Trigger",
        "kind": "draco.trigger",
        "trigger_role": "probe",
        "timestamp": "2025-01-16T08:00:00Z",
        "transport": "kafka",
        "payload_ref": {"channel_id": "Draco01", "run_id": 6},
        "values": None,
        "metadata": {},
    })

    assert "shot_number" not in event
    assert event["shot_id"] == "unassigned-evt-draco-003"


def test_normalize_hzdr_event_v1_requires_experiment_id():
    with pytest.raises(ValueError, match="experiment_id"):
        normalize_processed_trigger_message({
            "schema_version": "hzdr-event-v1",
            "event_id": "evt-draco-004",
            "source": "DRACO-Trigger",
            "kind": "draco.trigger",
            "timestamp": "2025-01-16T08:00:00Z",
            "transport": "kafka",
            "payload_ref": {"channel_id": "Draco01", "run_id": 7},
            "values": None,
            "metadata": {},
        })


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


def test_load_normalized_events_rejects_oversized_values_array(tmp_path: Path):
    """An event embedding a large array in `values` is rejected at staging time
    so producers steer big data into payload_ref instead of the envelope."""
    json_path = tmp_path / "oversized.json"
    event = normalized_event(values=[float(i) for i in range(5000)])
    json_path.write_text(json.dumps(event), encoding="utf-8")

    with pytest.raises(ValueError, match=r"oversized\.json: values has 5000 items"):
        load_normalized_events([json_path])


def test_load_normalized_events_accepts_small_values_array(tmp_path: Path):
    """A short waveform stays well under the guard and loads normally."""
    json_path = tmp_path / "ok.json"
    json_path.write_text(json.dumps(normalized_event()), encoding="utf-8")

    loaded = load_normalized_events([json_path])
    assert loaded[0]["values"] == [[1.0, 2.0], [3.0, 4.0]]


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


def test_single_writer_lock_blocks_a_second_concurrent_build(tmp_path: Path):
    output_nexus = tmp_path / "canonical.nxs"
    lock_path = tmp_path / "canonical.nxs.lock"

    with single_writer_lock(output_nexus):
        assert lock_path.exists()
        with (
            pytest.raises(BuilderAlreadyRunningError),
            single_writer_lock(output_nexus),
        ):
            pass  # pragma: no cover - must not be reached

    # released on normal exit, so a later build can proceed
    assert not lock_path.exists()
    with single_writer_lock(output_nexus):
        assert lock_path.exists()
    assert not lock_path.exists()


def test_single_writer_lock_is_released_even_if_the_build_raises(tmp_path: Path):
    output_nexus = tmp_path / "canonical.nxs"
    lock_path = tmp_path / "canonical.nxs.lock"

    def _failing_build() -> None:
        with single_writer_lock(output_nexus):
            assert lock_path.exists()
            message = "boom"
            raise ValueError(message)

    with pytest.raises(ValueError, match="boom"):
        _failing_build()

    assert not lock_path.exists()


def test_single_writer_lock_reclaims_a_stale_lock_from_a_dead_pid(tmp_path: Path):
    output_nexus = tmp_path / "canonical.nxs"
    lock_path = tmp_path / "canonical.nxs.lock"

    # A PID that is essentially guaranteed not to be a running process.
    lock_path.write_text("999999999", encoding="utf-8")

    with single_writer_lock(output_nexus):
        assert lock_path.read_text(encoding="utf-8").strip() == str(os.getpid())

    assert not lock_path.exists()


# --- Review sidecar tests ---


def _make_review_event(event_id: str, match_status: str, candidate_shot_keys=None):
    return {
        "event_id": event_id,
        "experiment_id": "HELPMI",
        "source": "PLANET-Watchdog",
        "kind": "watchdog.tps",
        "timestamp": "2026-06-10T12:00:00Z",
        "transport": "kafka",
        "payload_ref": {},
        "metadata": {},
        "match_status": match_status,
        "match_quality": match_status,
        "candidate_shot_keys": candidate_shot_keys or [],
    }


def _make_shot(shot_key: str, match_status: str = "labfrog-only"):
    return {
        "source_key": "hzdr-labfrog",
        "shot_number": int(shot_key.split(":")[-1]),
        "fired_at": "2026-06-10T12:00:00Z",
        "shot_key": shot_key,
        "shot_date": "2026-06-10",
        "match_status": match_status,
        "events": [],
        "data_products": [],
        "metadata": {},
    }


def test_append_review_decision_writes_sidecar_jsonl(tmp_path: Path):
    sources_file = tmp_path / "hzdr_sources.json"
    append_review_decision(
        sources_file,
        source_key="hzdr-labfrog",
        event_id="evt-1",
        action="confirm",
        by="alice",
        note="Looks right",
        shot_key="HELPMI:20260610:000017",
        candidate_shot_keys=["HELPMI:20260610:000017"],
        review_level="REVIEWED",
    )

    sidecar = review_sidecar_path(sources_file)
    assert sidecar.exists()
    record = json.loads(sidecar.read_text(encoding="utf-8").strip())
    assert record["event_id"] == "evt-1"
    assert record["action"] == "confirm"
    assert record["review_level"] == "REVIEWED"
    assert record["shot_key"] == "HELPMI:20260610:000017"
    assert record["by"] == "alice"


def test_load_review_decisions_returns_highest_rank_per_event(tmp_path: Path):
    sources_file = tmp_path / "hzdr_sources.json"
    # Write REVIEWED first, then VERIFIED for the same event_id.
    append_review_decision(
        sources_file,
        source_key="hzdr-labfrog",
        event_id="evt-1",
        action="confirm",
        by="alice",
        shot_key="HELPMI:20260610:000017",
        review_level="REVIEWED",
    )
    append_review_decision(
        sources_file,
        source_key="hzdr-labfrog",
        event_id="evt-1",
        action="confirm",
        by="bob",
        shot_key="HELPMI:20260610:000017",
        review_level="VERIFIED",
    )

    decisions = load_review_decisions(sources_file, "hzdr-labfrog")
    assert decisions["evt-1"]["review_level"] == "VERIFIED"
    assert decisions["evt-1"]["by"] == "bob"


def test_load_review_decisions_ignores_other_source_keys(tmp_path: Path):
    sources_file = tmp_path / "hzdr_sources.json"
    append_review_decision(
        sources_file,
        source_key="other-source",
        event_id="evt-1",
        action="confirm",
        by="alice",
        shot_key="HELPMI:20260610:000017",
    )

    decisions = load_review_decisions(sources_file, "hzdr-labfrog")
    assert decisions == {}


def test_write_sources_catalog_merges_confirmed_decision_from_sidecar(tmp_path: Path):
    """A confirmed event from the sidecar survives a full catalog rebuild."""
    sources_file = tmp_path / "hzdr_sources.json"
    nexus_path = tmp_path / "HELPMI.nxs"
    nexus_path.touch()

    shot_key = "HELPMI:20260610:000017"
    shot = _make_shot(shot_key)
    ambiguous_event = _make_review_event(
        "evt-ambiguous",
        "ambiguous",
        candidate_shot_keys=[shot_key],
    )

    # Simulate a prior operator confirm stored in the sidecar.
    append_review_decision(
        sources_file,
        source_key="hzdr-labfrog",
        event_id="evt-ambiguous",
        action="confirm",
        by="alice",
        note="Confirmed",
        shot_key=shot_key,
        candidate_shot_keys=[shot_key],
        review_level="REVIEWED",
    )

    # Builder reruns and regenerates the catalog from scratch.
    reconciled_event = {**ambiguous_event, "shot_id": "unassigned-0"}
    write_sources_catalog(
        sources_file=sources_file,
        source_key="hzdr-labfrog",
        experiment_id="HELPMI",
        nexus_path=nexus_path,
        shots=[shot],
        events=[reconciled_event],
    )

    source = load_sources_file(sources_file)[0]
    # Confirmed event should be attached to the shot, not sitting in review_events.
    assert source.match_summary.confirmed == 1
    assert source.match_summary.matched == 1
    assert source.match_summary.ambiguous == 0
    matched_shots = [s for s in source.shots if s.match_status == "matched"]
    assert len(matched_shots) == 1
    assert matched_shots[0].events[0].review_level == "REVIEWED"
    # Nothing left in review_events for this event_id.
    assert all(e.event_id != "evt-ambiguous" for e in source.review_events)


def test_write_sources_catalog_merges_dismissed_decision_from_sidecar(tmp_path: Path):
    """A dismissed event from the sidecar survives a full catalog rebuild."""
    sources_file = tmp_path / "hzdr_sources.json"
    nexus_path = tmp_path / "HELPMI.nxs"
    nexus_path.touch()

    unmatched_event = _make_review_event("evt-unmatched", "unmatched")

    append_review_decision(
        sources_file,
        source_key="hzdr-labfrog",
        event_id="evt-unmatched",
        action="dismiss",
        by="sam",
        note="Known glitch",
        review_level="VERIFIED",
    )

    reconciled_event = {**unmatched_event, "shot_id": "unassigned-0"}
    write_sources_catalog(
        sources_file=sources_file,
        source_key="hzdr-labfrog",
        experiment_id="HELPMI",
        nexus_path=nexus_path,
        shots=[],
        events=[reconciled_event],
    )

    source = load_sources_file(sources_file)[0]
    assert source.match_summary.dismissed == 1
    assert source.match_summary.unmatched == 0
    dismissed = next(e for e in source.review_events if e.event_id == "evt-unmatched")
    assert dismissed.acknowledged is True
    assert dismissed.acknowledged_by == "sam"
    assert dismissed.review_level == "VERIFIED"


def test_verified_beats_reviewed_in_write_sources_catalog(tmp_path: Path):
    """If an event has both REVIEWED and VERIFIED decisions, VERIFIED wins."""
    sources_file = tmp_path / "hzdr_sources.json"
    nexus_path = tmp_path / "HELPMI.nxs"
    nexus_path.touch()

    shot_key = "HELPMI:20260610:000017"
    shot = _make_shot(shot_key)
    ambiguous_event = _make_review_event(
        "evt-dual", "ambiguous", candidate_shot_keys=[shot_key]
    )

    append_review_decision(
        sources_file,
        source_key="hzdr-labfrog",
        event_id="evt-dual",
        action="confirm",
        by="alice",
        shot_key=shot_key,
        candidate_shot_keys=[shot_key],
        review_level="REVIEWED",
    )
    append_review_decision(
        sources_file,
        source_key="hzdr-labfrog",
        event_id="evt-dual",
        action="confirm",
        by="bob",
        shot_key=shot_key,
        candidate_shot_keys=[shot_key],
        review_level="VERIFIED",
    )

    reconciled_event = {**ambiguous_event, "shot_id": "unassigned-0"}
    write_sources_catalog(
        sources_file=sources_file,
        source_key="hzdr-labfrog",
        experiment_id="HELPMI",
        nexus_path=nexus_path,
        shots=[shot],
        events=[reconciled_event],
    )

    source = load_sources_file(sources_file)[0]
    matched_shots = [s for s in source.shots if s.match_status == "matched"]
    assert len(matched_shots) == 1
    history = matched_shots[0].metadata["match_confirmation_history"]
    assert history[0]["review_level"] == "VERIFIED"
    assert history[0]["by"] == "bob"
