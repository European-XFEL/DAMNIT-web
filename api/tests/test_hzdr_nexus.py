import contextlib
import json
import os
import socket
import sqlite3
import sys
import threading
import time
from pathlib import Path
from typing import cast

import h5py
import numpy as np
import pytest

from damnit_api.metadata.hzdr_nexus import (
    HZDR_BRIDGE_PROFILE_VERSION,
    HZDR_TARGET_PROFILE_VERSION,
    BuilderAlreadyRunningError,
    LockLostError,
    _first_shot_laser,
    _first_shot_target,
    _first_shot_vacuum,
    _merge_shot_metadata,
    append_review_decision,
    discover_labfrog_data_products,
    labfrog_shot_status,
    load_normalized_events,
    load_review_decisions,
    normalize_processed_trigger_message,
    normalize_watchdog_document,
    read_labfrog_nexus_shots,
    read_labfrog_sqlite_shots,
    reconcile_canonical_shots,
    replace_with_retry,
    review_sidecar_backup_path,
    review_sidecar_path,
    single_writer_lock,
    write_json_atomic,
    write_nexus_bridge,
    write_nexus_detector_groups,
    write_nexus_diagnostic_groups,
    write_nexus_vacuum_group,
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
        shots.create_dataset("authority_shot_number", data=[17, 18])
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


def test_preserved_labfrog_nexus_accepts_trigger_only_union(tmp_path: Path):
    source = tmp_path / "labfrog.nxs"
    output = tmp_path / "canonical.nxs"
    write_labfrog_nexus(source)
    event = normalized_event(
        source="DRACO-Trigger",
        kind="trigger.threshold_crossing",
        shot_id="shot-000099",
        shot_number=99,
        timestamp="2026-06-10T15:00:00Z",
        values=None,
    )
    shots, events = reconcile_canonical_shots(
        [event],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=read_labfrog_nexus_shots(source),
    )
    assert [shot["shot_number"] for shot in shots] == [17, 18, 99]
    write_nexus_bridge(
        output_path=output,
        source_nexus=source,
        experiment_id="HELPMI",
        shots=shots,
        events=events,
    )
    with h5py.File(output, "r") as handle:
        assert list(handle["entry/shots/shot_number"]) == [17, 18, 99]
        assert list(handle["entry/shots/record_id"].asstr()) == [
            "mongo-17",
            "mongo-18",
            "",
        ]
        assert handle["entry/shots"].attrs["labfrog_shot_count"] == 2
        assert list(handle["entry/derived/ict_charge"]) == [1.2, 1.4]


def test_preserves_rich_labfrog_nexus_and_adds_damnit_bridge(tmp_path: Path):
    labfrog_nexus = tmp_path / "labfrog.nxs"
    output_nexus = tmp_path / "canonical.nxs"
    sources_file = tmp_path / "hzdr_sources.json"
    write_labfrog_nexus(labfrog_nexus)

    labfrog_shots = read_labfrog_nexus_shots(labfrog_nexus)
    shots, events = reconcile_canonical_shots(
        [
            normalized_event(
                metadata={
                    "unit": "count",
                    "laser": {
                        "system": "DRACO",
                        "pulse_energy": 8.2,
                        "pulse_duration": 30.0,
                        "wavelength": 800.0,
                        "repetition_rate": 10.0,
                        "polarization": "p",
                        "beam_pos_x": 0.12,
                        "beam_pos_y": -0.08,
                        "beam_waist_x": 1.8,
                        "beam_waist_y": 1.9,
                    },
                    "vacuum": {
                        "chamber_pressure": 2.4e-6,
                        "pre_shot_pressure": 1.1e-6,
                        "rga_dominant_species": "H2O",
                    },
                    "diagnostic": {"xray_counts": 1450},
                    # Pre-namespace flat spelling; folded by the writer.
                    "detector_signal_mean": 2.25,
                }
            )
        ],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=labfrog_shots,
    )
    products = discover_labfrog_data_products(labfrog_nexus, shots)
    for product in products:
        shots[product["metadata"]["shot_index"]]["data_products"].append(product)
    # A semantic-kind product (as planet-watchdog delivers them), so the
    # per-kind NXdetector promotion has something to work on.
    shots[0]["data_products"].append({
        "product_id": "watchdog:streak:17",
        "shot_key": shots[0]["shot_key"],
        "source": "planet-watchdog",
        "kind": "streak_camera",
        "path": "Z:/data/streak-17.h5",
        "dataset_name": "/image",
    })

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
        raw_kept = cast("h5py.Dataset", handle["entry/raw_labfrog/kept"])
        shot_key = cast("h5py.Dataset", handle["entry/shots/shot_key"])
        match_quality = cast("h5py.Dataset", handle["entry/shots/match_quality"])
        source_shot_key = cast("h5py.Dataset", handle["entry/source_events/shot_key"])
        laser = cast("h5py.Group", handle["entry/instrument/laser"])
        laser_name = cast("h5py.Dataset", laser["name"])
        laser_frequency = cast("h5py.Dataset", laser["frequency"])
        laser_pulse_energy = cast("h5py.Dataset", laser["pulse_energy"])
        beam = cast("h5py.Group", handle["entry/instrument/laser/beam"])
        incident_wavelength = cast("h5py.Dataset", beam["incident_wavelength"])
        pulse_duration = cast("h5py.Dataset", beam["pulse_duration"])
        incident_polarization = cast("h5py.Dataset", beam["incident_polarization"])
        beam_waist_x = cast("h5py.Dataset", beam["beam_waist_x_1e2_radius"])
        beam_waist_y = cast("h5py.Dataset", beam["beam_waist_y_1e2_radius"])
        environment = cast("h5py.Group", handle["entry/sample/environment"])
        chamber_pressure = cast("h5py.Dataset", environment["chamber_pressure"])
        pre_shot_pressure = cast("h5py.Dataset", environment["pre_shot_pressure"])
        rga_species = cast("h5py.Dataset", environment["rga_dominant_species"])

        assert list(raw_kept[...]) == [1, 2]
        definition = cast("h5py.Dataset", handle["entry/definition"])
        assert definition.asstr()[()] == "NXhzdr_target"
        assert shot_key.asstr()[0] == "HELPMI:20260610:000017"
        assert match_quality.asstr()[0] == "exact_day_shot_number"
        assert source_shot_key.asstr()[0] == "HELPMI:20260610:000017"
        assert laser.attrs["NX_class"] == "NXsource"
        assert laser_name.asstr()[()] == "DRACO"
        assert cast("h5py.Dataset", laser["probe"]).asstr()[()] == "visible light"
        assert laser_frequency.attrs["units"] == "Hz"
        assert laser_frequency[()] == pytest.approx(10.0)
        assert laser_pulse_energy.attrs["units"] == "J"
        assert laser_pulse_energy[()] == pytest.approx(8.2)
        assert beam.attrs["NX_class"] == "NXbeam"
        assert incident_wavelength.attrs["units"] == "nm"
        assert incident_wavelength[()] == pytest.approx(800.0)
        assert pulse_duration.attrs["units"] == "fs"
        assert pulse_duration[()] == pytest.approx(30.0)
        assert incident_polarization.asstr()[()] == "p"
        assert beam_waist_x.attrs["units"] == "um"
        assert beam_waist_x[()] == pytest.approx(1.8)
        assert beam_waist_y.attrs["units"] == "um"
        assert beam_waist_y[()] == pytest.approx(1.9)
        assert "extent_x" not in beam
        assert "extent_y" not in beam
        assert environment.attrs["NX_class"] == "NXenvironment"
        assert chamber_pressure.attrs["units"] == "mbar"
        assert chamber_pressure[()] == pytest.approx(2.4e-6)
        assert pre_shot_pressure.attrs["units"] == "mbar"
        assert pre_shot_pressure[()] == pytest.approx(1.1e-6)
        assert rga_species.asstr()[()] == "H2O"
        # Per-shot diagnostic scalars become NXdetector groups; the second
        # shot carried no diagnostics, so its slot is NaN.
        xray = cast("h5py.Group", handle["entry/instrument/xray_counts"])
        assert xray.attrs["NX_class"] == "NXdetector"
        assert xray.attrs["damnit_source"] == "metadata.diagnostic"
        xray_data = cast("h5py.Dataset", xray["data"])
        assert xray_data.shape[0] == shot_key.shape[0]
        assert xray_data[0] == pytest.approx(1450.0)
        # Legacy flat spelling folded into the same NXdetector shape.
        signal = cast(
            "h5py.Dataset", handle["entry/instrument/detector_signal_mean/data"]
        )
        assert signal[0] == pytest.approx(2.25)
        # Per-shot laser series (NXdata) alongside the campaign snapshot;
        # shot 18 carried no laser block, so its slot is NaN.
        series = cast("h5py.Group", handle["entry/instrument/laser/shot_series"])
        assert series.attrs["NX_class"] == "NXdata"
        assert series.attrs["signal"] == "pulse_energy"
        assert series.attrs["axes"] == "shot_index"
        series_energy = cast("h5py.Dataset", series["pulse_energy"])
        assert series_energy.attrs["units"] == "J"
        assert series_energy[0] == pytest.approx(8.2)
        assert np.isnan(series_energy[1])
        # The semantic-kind product gets an NXdetector group with its type
        # tag; generic hdf5_dataset/file transport kinds do not.
        product_detector = cast(
            "h5py.Group", handle["entry/instrument/detector_streak_camera"]
        )
        assert product_detector.attrs["NX_class"] == "NXdetector"
        assert product_detector.attrs["detector_type"] == "STREAK"
        detector_shot_keys = cast("h5py.Dataset", product_detector["shot_keys"])
        assert detector_shot_keys.asstr()[0] == "HELPMI:20260610:000017"
        assert "detector_hdf5_dataset" not in cast(
            "h5py.Group", handle["entry/instrument"]
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
        "planet-watchdog",
    }
    # "last rebuild" timestamp, surfaced for the Flow Monitor status panel
    assert "catalog_built_at" in sources[0].metadata


def test_duplicate_tango_shot_number_uses_timestamp_disambiguation():
    duplicate_rows = [
        {
            "record_id": "a",
            "shot_number": 17,
            "authority_shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:20Z",
            "metadata": {},
        },
        {
            "record_id": "b",
            "shot_number": 17,
            "authority_shot_number": 17,
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
        time_match_autoassign=True,  # the pre-A7 ladder, opted into
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
            "authority_shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T11:59:40Z",
            "metadata": {},
        },
        {
            "record_id": "b",
            "shot_number": 17,
            "authority_shot_number": 17,
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


def test_typed_labfrog_number_does_not_claim_authoritative_trigger():
    """A typed number can repeat daily; it is not a shot-authority claim."""
    typed_row = {
        "record_id": "typed-17",
        "shot_number": 17,
        "shot_date": "2026-06-10",
        "labfrog_date_time": "2026-06-10T12:00:00Z",
        "metadata": {},
    }
    trigger = normalized_event(
        source="DRACO-Trigger",
        kind="draco.trigger",
        shot_number=17,
        values=None,
    )

    shots, events = reconcile_canonical_shots(
        [trigger],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=[typed_row],
    )

    assert [shot["labfrog_record_id"] for shot in shots] == ["typed-17"]
    assert shots[0]["match_status"] == "labfrog-only"
    assert events[0]["match_status"] != "matched"
    assert events[0]["shot_key"] == ""


def test_naive_labfrog_time_uses_campaign_timezone_for_timestamp_match():
    labfrog_shots = [
        {
            "record_id": "local-time-shot",
            "shot_number": 1,
            "authority_shot_number": 1,
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
            "authority_shot_number": 1,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T09:00:00+02:00",
            "metadata": {},
        },
        {
            "record_id": "day-two",
            "shot_number": 1,
            "authority_shot_number": 1,
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
            "authority_shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:10Z",
            "metadata": {"has_newer_version": True},
        },
        {
            "record_id": "current",
            "shot_number": 17,
            "authority_shot_number": 17,
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


def test_reads_labfrog_sqlite_target_columns_as_metadata_target(tmp_path: Path):
    sqlite_path = tmp_path / "campaign.sqlite"
    with sqlite3.connect(sqlite_path) as connection:
        connection.execute(
            """
            CREATE TABLE shots (
                mongo_id TEXT PRIMARY KEY,
                shot_number INTEGER,
                date_time TEXT,
                campaign TEXT,
                target TEXT,
                target_name TEXT,
                target_material TEXT,
                target_thickness_value REAL,
                target_thickness_unit TEXT,
                target_notes TEXT,
                target_source TEXT,
                target_series_sample TEXT,
                status TEXT
            )
            """
        )
        connection.execute(
            "INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "mongo-17",
                17,
                "2026-06-10T12:00:20Z",
                "HELPMI",
                "OTHER: Kapton witness; Kapton; 0.5 um; mounted on frame",
                "Kapton witness",
                "Kapton",
                0.5,
                "um",
                "mounted on frame",
                "operator",
                "K-02",
                "active",
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
            "metadata": {
                "target": {
                    "name": "Kapton witness",
                    "type": "other",
                    "provenance": "manual",
                    "material": "Kapton",
                    "thickness": 500.0,
                    "notes": "mounted on frame",
                },
                "target_series_sample": "K-02",
                "status": "active",
            },
        }
    ]


def test_reads_labfrog_sqlite_gas_jet_into_metadata_target(tmp_path: Path):
    sqlite_path = tmp_path / "campaign.sqlite"
    with sqlite3.connect(sqlite_path) as connection:
        connection.execute(
            """
            CREATE TABLE shots (
                mongo_id TEXT PRIMARY KEY,
                shot_number INTEGER,
                date_time TEXT,
                campaign TEXT,
                target TEXT,
                target_name TEXT,
                target_notes TEXT,
                target_source TEXT,
                target_type TEXT,
                target_gas_species TEXT,
                target_gas_pressure_value REAL,
                target_gas_pressure_unit TEXT
            )
            """
        )
        connection.execute(
            "INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "mongo-gas-jet",
                23,
                "2026-07-19T12:00:00Z",
                "Solenoid",
                "OTHER",
                "OTHER",
                "electron-team nozzle",
                "manual",
                "gas_jet",
                "N2",
                12.5,
                "bar",
            ),
        )

    shots = read_labfrog_sqlite_shots(sqlite_path)

    assert shots[0]["metadata"]["target"] == {
        "name": "OTHER",
        "type": "gas_jet",
        "provenance": "manual",
        "notes": "electron-team nozzle",
        "gas_species": "N2",
        "gas_pressure": 12.5,
    }


def test_reads_labfrog_sqlite_wiki_target_extras_into_metadata_target(tmp_path: Path):
    """Wiki-catalog extras (schema v9/v10 columns) map onto metadata.target.

    target_wiki_page/target_wiki_ref become typed wiki_page/wiki_ref keys and
    imply provenance=wiki; target_type maps through the wiki vocabulary to the
    ontology type enum (hzdr/docs/target-ontology.md §2.3); provider/status/amount/
    production_date/origin (IonenTargetOrigin columns) land in the properties
    bag as supplier/status/amount/production_date/origin, and the original
    wiki type text is kept in properties.wiki_type.
    """
    sqlite_path = tmp_path / "campaign.sqlite"
    with sqlite3.connect(sqlite_path) as connection:
        connection.execute(
            """
            CREATE TABLE shots (
                mongo_id TEXT PRIMARY KEY,
                shot_number INTEGER,
                date_time TEXT,
                campaign TEXT,
                target TEXT,
                target_name TEXT,
                target_material TEXT,
                target_thickness_value REAL,
                target_thickness_unit TEXT,
                target_notes TEXT,
                target_source TEXT,
                target_wiki_page TEXT,
                target_wiki_ref TEXT,
                target_status TEXT,
                target_provider TEXT,
                target_amount TEXT,
                target_type TEXT,
                target_production_date TEXT,
                target_origin TEXT
            )
            """
        )
        connection.execute(
            "INSERT INTO shots VALUES "
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "mongo-18",
                18,
                "2026-06-10T13:00:00Z",
                "HELPMI",
                "0.4% Formvar",
                "0.4% Formvar",
                "Formvar",
                None,
                None,
                None,
                "wiki",
                "Ionen:0.4%Formvar092022",
                (
                    "https://athene.fz-rossendorf.de/fwk/index.php"
                    "?title=Ionen:0.4%25Formvar092022"
                ),
                "available",
                "HZDR target lab",
                "ca. 20 pieces",
                "foil",
                "2026-01-15",
                "HZDR target lab",
            ),
        )

    shots = read_labfrog_sqlite_shots(sqlite_path)

    assert len(shots) == 1
    metadata = shots[0]["metadata"]
    assert metadata["target"] == {
        "name": "0.4% Formvar",
        "provenance": "wiki",
        "type": "foil",
        "material": "Formvar",
        "wiki_page": "Ionen:0.4%Formvar092022",
        "wiki_ref": (
            "https://athene.fz-rossendorf.de/fwk/index.php"
            "?title=Ionen:0.4%25Formvar092022"
        ),
        "properties": {
            "supplier": "HZDR target lab",
            "status": "available",
            "amount": "ca. 20 pieces",
            "production_date": "2026-01-15",
            "origin": "HZDR target lab",
            "wiki_type": "foil",
        },
    }
    # The wiki extras are folded into metadata.target, not left as flat keys.
    for flat_key in (
        "target_wiki_page",
        "target_wiki_ref",
        "target_status",
        "target_provider",
        "target_amount",
        "target_type",
        "target_production_date",
        "target_origin",
    ):
        assert flat_key not in metadata


def test_labfrog_wiki_target_type_maps_unrecognized_vocab_to_other(tmp_path: Path):
    """Unmapped wiki target types fall back to "other", keeping the original text.

    hzdr/docs/target-ontology.md §2.3: foil->foil, wafer->foil, solution->liquid,
    wire->other, anything unrecognized->other; the original wiki value is kept
    in properties.wiki_type so it is never silently discarded.
    """
    sqlite_path = tmp_path / "campaign.sqlite"
    with sqlite3.connect(sqlite_path) as connection:
        connection.execute(
            """
            CREATE TABLE shots (
                mongo_id TEXT PRIMARY KEY,
                shot_number INTEGER,
                date_time TEXT,
                campaign TEXT,
                target TEXT,
                target_name TEXT,
                target_source TEXT,
                target_wiki_page TEXT,
                target_type TEXT
            )
            """
        )
        connection.execute(
            "INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "mongo-19",
                19,
                "2026-06-11T09:00:00Z",
                "HELPMI",
                "Gold wire",
                "Gold wire",
                "wiki",
                "Ionen:GoldWire",
                "wire",
            ),
        )

    shots = read_labfrog_sqlite_shots(sqlite_path)

    metadata = shots[0]["metadata"]
    assert metadata["target"]["type"] == "other"
    assert metadata["target"]["properties"]["wiki_type"] == "wire"


def test_event_target_metadata_does_not_replace_labfrog_details():
    labfrog_shots = [
        {
            "record_id": "target-shot",
            "shot_number": 17,
            "authority_shot_number": 17,
            "shot_date": "2026-06-10",
            "labfrog_date_time": "2026-06-10T12:00:20Z",
            "metadata": {
                "target": {
                    "name": "Kapton witness",
                    "type": "other",
                    "provenance": "manual",
                    "material": "Kapton",
                    "thickness": 500.0,
                    "notes": "mounted on frame",
                }
            },
        }
    ]

    shots, events = reconcile_canonical_shots(
        [
            normalized_event(
                timestamp="2026-06-10T12:00:20Z",
                metadata={"target": "LaserData target label"},
            )
        ],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=labfrog_shots,
    )

    assert events[0]["match_status"] == "matched"
    target = shots[0]["metadata"]["target"]
    assert target["name"] == "LaserData target label"
    assert target["material"] == "Kapton"
    assert target["thickness"] == pytest.approx(500.0)
    assert target["notes"] == "mounted on frame"


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
    assert any("non-latest row active" in record.message for record in caplog.records)


def test_multiple_active_rows_warn_and_remain_current(tmp_path: Path, caplog):
    """Duplicate active rows remain current but always require source review."""
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
                ("mongo-a", 17, "2026-06-10T12:00:20", "HELPMI", "active", 2),
                ("mongo-b", 17, "2026-06-10T12:00:21", "HELPMI", "active", 2),
            ],
        )

    with caplog.at_level("WARNING"):
        shots = read_labfrog_sqlite_shots(sqlite_path)

    assert [shot["metadata"]["has_newer_version"] for shot in shots] == [False, False]
    assert any("multiple rows active" in record.message for record in caplog.records)
    assert any(
        "source-owner review is required" in record.message for record in caplog.records
    )


def test_first_shot_target_warns_once_when_a_later_shot_differs(caplog):
    """The first target remains the campaign snapshot while differences warn.

    Full per-shot blocks are preserved by `write_nexus_bridge` in the canonical
    shot table; this helper only chooses `/entry/sample`.
    """
    shots = [
        {
            "shot_number": 1,
            "shot_key": "HELPMI:20260610:000001",
            "metadata": {"target": {"name": "Al foil"}},
        },
        {
            "shot_number": 2,
            "shot_key": "HELPMI:20260610:000002",
            "metadata": {"target": {"name": "Al foil"}},
        },
        {
            "shot_number": 3,
            "shot_key": "HELPMI:20260610:000003",
            "metadata": {"target": {"name": "Cu wire"}},
        },
        {
            "shot_number": 4,
            "shot_key": "HELPMI:20260610:000004",
            "metadata": {"target": {"name": "Ti foil"}},
        },
    ]

    with caplog.at_level("WARNING"):
        target = _first_shot_target(shots)

    assert target == {"name": "Al foil"}
    warnings = [r for r in caplog.records if "target metadata block" in r.message]
    assert len(warnings) == 1
    # Only the first divergent shot (shot_number=3) is named; shot 4 (also
    # divergent) does not trigger a second warning.
    assert warnings[0].args[0] == 3


def test_bridge_preserves_per_shot_target_metadata(tmp_path: Path, caplog):
    output_nexus = tmp_path / "campaign-targets.nxs"
    shots = [
        {
            "shot_number": 1,
            "shot_key": "HELPMI:20260610:000001",
            "metadata": {"target": {"name": "Al foil", "type": "foil"}},
        },
        {
            "shot_number": 2,
            "shot_key": "HELPMI:20260610:000002",
            "metadata": {
                "target": {
                    "name": "gas jet",
                    "type": "gas_jet",
                    "gas_species": "N2",
                    "gas_pressure": 12.5,
                }
            },
        },
    ]

    with caplog.at_level("WARNING"):
        write_nexus_bridge(
            output_path=output_nexus,
            experiment_id="HELPMI",
            shots=shots,
            events=[],
        )

    with h5py.File(output_nexus, "r") as handle:
        target_series = cast("h5py.Dataset", handle["entry/shots/target_metadata_json"])
        assert [json.loads(value) for value in target_series.asstr()[...]] == [
            {"name": "Al foil", "type": "foil"},
            {
                "gas_pressure": 12.5,
                "gas_species": "N2",
                "name": "gas jet",
                "type": "gas_jet",
            },
        ]
        sample_name = cast("h5py.Dataset", handle["entry/sample/name"])
        assert sample_name.asstr()[()] == "Al foil"
        assert handle.attrs["damnit_bridge_profile"] == HZDR_BRIDGE_PROFILE_VERSION
        assert (
            handle["entry/shots"].attrs["damnit_bridge_profile"]
            == HZDR_BRIDGE_PROFILE_VERSION
        )

    warnings = [r for r in caplog.records if "target metadata block" in r.message]
    assert len(warnings) == 1
    assert "/entry/shots/target_metadata_json" in warnings[0].message


def test_first_shot_laser_warns_once_when_a_later_shot_differs(caplog):
    """Same silent-drop risk as `_first_shot_target`, for the campaign-level
    /entry/instrument/laser block."""
    shots = [
        {
            "shot_number": 1,
            "shot_key": "HELPMI:20260610:000001",
            "metadata": {"laser": {"system": "DRACO"}},
        },
        {
            "shot_number": 2,
            "shot_key": "HELPMI:20260610:000002",
            "metadata": {"laser": {"system": "PENELOPE"}},
        },
    ]

    with caplog.at_level("WARNING"):
        laser = _first_shot_laser(shots)

    assert laser == {"system": "DRACO"}
    warnings = [r for r in caplog.records if "laser metadata block" in r.message]
    assert len(warnings) == 1


def test_first_shot_vacuum_warns_once_when_a_later_shot_differs(caplog):
    """Same silent-drop risk as `_first_shot_laser`, for the campaign-level
    /entry/sample/environment block."""
    shots = [
        {
            "shot_number": 1,
            "shot_key": "HELPMI:20260610:000001",
            "metadata": {"vacuum": {"chamber_pressure": 2.4e-6}},
        },
        {
            "shot_number": 2,
            "shot_key": "HELPMI:20260610:000002",
            "metadata": {"vacuum": {"chamber_pressure": 8.0e-3}},
        },
    ]

    with caplog.at_level("WARNING"):
        vacuum = _first_shot_vacuum(shots)

    assert vacuum == {"chamber_pressure": 2.4e-6}
    warnings = [r for r in caplog.records if "vacuum metadata block" in r.message]
    assert len(warnings) == 1


def test_bridge_without_source_nexus_writes_experiment_identifier(tmp_path: Path):
    """A canonical build with no preserved LabFrog file must still carry the
    standard NXentry experiment_identifier itself (the LabFrog projection also
    writes one, but the bridge must not depend on preservation for it)."""
    output_nexus = tmp_path / "canonical.nxs"
    shots, events = reconcile_canonical_shots(
        [normalized_event()],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=[],
    )

    write_nexus_bridge(
        output_path=output_nexus,
        experiment_id="HELPMI",
        shots=shots,
        events=events,
    )

    with h5py.File(output_nexus, "r") as handle:
        identifier = cast("h5py.Dataset", handle["entry/experiment_identifier"])
        assert identifier.asstr()[()] == "HELPMI"


def test_bridge_writes_campaign_time_bounds(tmp_path: Path):
    """entry/start_time and end_time come from the earliest/latest shot
    fired_at (standard NXentry fields, profile v0.6)."""
    output_nexus = tmp_path / "canonical.nxs"
    shots, events = reconcile_canonical_shots(
        [
            normalized_event(),
            normalized_event(shot_id="shot-000018", timestamp="2026-06-10T12:05:00Z"),
        ],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=[],
    )
    write_nexus_bridge(
        output_path=output_nexus,
        experiment_id="HELPMI",
        shots=shots,
        events=events,
    )

    with h5py.File(output_nexus, "r") as handle:
        start = cast("h5py.Dataset", handle["entry/start_time"])
        end = cast("h5py.Dataset", handle["entry/end_time"])
        assert start.asstr()[()] == "2026-06-10T12:00:00+00:00"
        assert end.asstr()[()] == "2026-06-10T12:05:00+00:00"
        assert start.attrs["damnit_source"] == "shots"
        assert end.attrs["damnit_source"] == "shots"


def test_fixed_laser_config_fills_the_campaign_group(tmp_path: Path):
    """The fields no producer sends — wavelength, repetition rate,
    polarization, system name — come from the deployment's fixed laser config
    (standards-alignment.md §3.10) and are marked as configured, not measured.

    The laser group is written even though no shot carries a laser block: the
    constants describe the laser, not the shot.
    """
    output_nexus = tmp_path / "canonical.nxs"
    shots, events = reconcile_canonical_shots(
        [normalized_event()],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=[],
    )

    write_nexus_bridge(
        output_path=output_nexus,
        experiment_id="HELPMI",
        shots=shots,
        events=events,
        laser_config={
            "system": "DRACO",
            "wavelength": 800.0,
            "repetition_rate": 1.0,
            "polarization": "p",
        },
    )

    with h5py.File(output_nexus, "r") as handle:
        laser = cast("h5py.Group", handle["entry/instrument/laser"])
        beam = cast("h5py.Group", laser["beam"])
        name = cast("h5py.Dataset", laser["name"])
        frequency = cast("h5py.Dataset", laser["frequency"])
        wavelength = cast("h5py.Dataset", beam["incident_wavelength"])
        polarization = cast("h5py.Dataset", beam["incident_polarization"])

        assert laser.attrs["NX_class"] == "NXsource"
        assert name.asstr()[()] == "DRACO"
        assert frequency[()] == pytest.approx(1.0)
        assert frequency.attrs["units"] == "Hz"
        assert wavelength[()] == pytest.approx(800.0)
        assert wavelength.attrs["units"] == "nm"
        assert polarization.asstr()[()] == "p"
        for dataset in (name, frequency, wavelength, polarization):
            assert dataset.attrs["damnit_source"] == "config"


def test_producer_laser_values_win_over_fixed_config(tmp_path: Path):
    """Config states what the laser *is*; a producer value is a measurement
    and must never be overwritten by it — nor carry the config marker."""
    output_nexus = tmp_path / "canonical.nxs"
    shots, events = reconcile_canonical_shots(
        [normalized_event(metadata={"laser": {"wavelength": 1053.0}})],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=[],
    )

    write_nexus_bridge(
        output_path=output_nexus,
        experiment_id="HELPMI",
        shots=shots,
        events=events,
        laser_config={"wavelength": 800.0, "polarization": "p"},
    )

    with h5py.File(output_nexus, "r") as handle:
        beam = cast("h5py.Group", handle["entry/instrument/laser/beam"])
        wavelength = cast("h5py.Dataset", beam["incident_wavelength"])
        polarization = cast("h5py.Dataset", beam["incident_polarization"])

        assert wavelength[()] == pytest.approx(1053.0)
        assert "damnit_source" not in wavelength.attrs
        # The gap the producer left is still filled, and still marked.
        assert polarization.asstr()[()] == "p"
        assert polarization.attrs["damnit_source"] == "config"


def test_bridge_without_laser_config_is_unchanged(tmp_path: Path):
    """An unconfigured deployment builds the file it built before: no laser
    group appears out of nowhere when nothing supplies laser metadata."""
    output_nexus = tmp_path / "canonical.nxs"
    shots, events = reconcile_canonical_shots(
        [normalized_event()],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=[],
    )

    write_nexus_bridge(
        output_path=output_nexus,
        experiment_id="HELPMI",
        shots=shots,
        events=events,
    )

    with h5py.File(output_nexus, "r") as handle:
        assert "entry/instrument/laser/name" not in handle
        assert "entry/instrument/laser/beam" not in handle


def test_time_bounds_refresh_damnit_written_datasets(tmp_path: Path):
    """Bounds written by DAMNIT (damnit_source marker) are rewritten on a
    later build so end_time tracks a growing campaign."""
    from damnit_api.metadata.hzdr_nexus import _write_campaign_time_bounds

    path = tmp_path / "campaign.nxs"
    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        _write_campaign_time_bounds(entry, [{"fired_at": "2026-06-10T12:00:00Z"}])
        _write_campaign_time_bounds(
            entry,
            [
                {"fired_at": "2026-06-10T12:00:00Z"},
                {"fired_at": "2026-06-10T13:00:00Z"},
            ],
        )

    with h5py.File(path, "r") as handle:
        start = cast("h5py.Dataset", handle["entry/start_time"])
        end = cast("h5py.Dataset", handle["entry/end_time"])
        assert start.asstr()[()] == "2026-06-10T12:00:00+00:00"
        assert end.asstr()[()] == "2026-06-10T13:00:00+00:00"


def test_time_bounds_never_overwrite_a_foreign_dataset(tmp_path: Path):
    """A start_time written by someone else (no damnit_source marker, e.g. a
    future LabFrog projection) is preserved, mirroring the group claim rule."""
    from damnit_api.metadata.hzdr_nexus import _write_campaign_time_bounds

    path = tmp_path / "campaign.nxs"
    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        entry.create_dataset("start_time", data="2026-01-01T00:00:00Z")
        _write_campaign_time_bounds(entry, [{"fired_at": "2026-06-10T12:00:00Z"}])

    with h5py.File(path, "r") as handle:
        start = cast("h5py.Dataset", handle["entry/start_time"])
        end = cast("h5py.Dataset", handle["entry/end_time"])
        assert start.asstr()[()] == "2026-01-01T00:00:00Z"
        assert "damnit_source" not in start.attrs
        assert end.asstr()[()] == "2026-06-10T12:00:00+00:00"


def test_diagnostic_groups_write_per_shot_series_and_respect_owners(tmp_path: Path):
    """Namespaced values win over legacy flat spellings, non-numeric series
    fall back to strings, and a group owned by someone else (e.g. a preserved
    LabFrog projection group) is never overwritten."""
    shots = [
        {
            "metadata": {
                "diagnostic": {"xray_counts": 1500, "rga_species": "H2O"},
                "xray_counts": 999,  # legacy duplicate loses to the namespaced value
            }
        },
        {"metadata": {"diagnostic": {"xray_counts": 1550}}},
    ]
    path = tmp_path / "campaign.nxs"
    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        instrument = entry.create_group("instrument")
        foreign = instrument.create_group("rga_species")
        foreign.attrs["NX_class"] = "NXcollection"
        write_nexus_diagnostic_groups(entry, shots)

    with h5py.File(path, "r") as handle:
        xray = cast("h5py.Dataset", handle["entry/instrument/xray_counts/data"])
        assert xray[0] == pytest.approx(1500.0)
        assert xray[1] == pytest.approx(1550.0)
        # Registry-stamped since diagnostic.* gained registry entries (2026-07-18).
        assert xray.attrs["units"] == "counts"
        # The pre-existing non-DAMNIT group was left untouched.
        foreign = cast("h5py.Group", handle["entry/instrument/rga_species"])
        assert foreign.attrs["NX_class"] == "NXcollection"
        assert "data" not in foreign


def test_detector_groups_map_known_kinds_and_skip_transport_kinds(tmp_path: Path):
    """streak_camera maps to detector_type STREAK; the generic hdf5_dataset
    transport kind gets no NXdetector group at all."""
    products = [
        {
            "product_id": "p1",
            "shot_key": "HELPMI:20260610:000001",
            "kind": "streak_camera",
            "path": "/data/a.h5",
            "dataset_name": "/image",
        },
        {
            "product_id": "p2",
            "shot_key": "HELPMI:20260610:000002",
            "kind": "hdf5_dataset",
            "path": "/data/b.h5",
            "dataset_name": "/values",
        },
    ]
    path = tmp_path / "campaign.nxs"
    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        write_nexus_detector_groups(entry, products)

    with h5py.File(path, "r") as handle:
        streak = cast("h5py.Group", handle["entry/instrument/detector_streak_camera"])
        assert streak.attrs["NX_class"] == "NXdetector"
        assert streak.attrs["detector_type"] == "STREAK"
        product_ids = cast("h5py.Dataset", streak["product_ids"])
        assert product_ids.asstr()[0] == "p1"
        assert "detector_hdf5_dataset" not in cast(
            "h5py.Group", handle["entry/instrument"]
        )


def test_vacuum_group_without_target_keeps_sample_certifiable(tmp_path: Path):
    """A vacuum-only file must still stamp the NXhzdr_target profile marker
    attrs on /entry/sample (the NXDL requires them whenever the group exists),
    and absent vacuum keys must not be written at all."""
    path = tmp_path / "campaign.nxs"
    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        write_nexus_vacuum_group(entry, {"chamber_pressure": 2.4e-6})

    with h5py.File(path, "r") as handle:
        sample = cast("h5py.Group", handle["entry/sample"])
        environment = cast("h5py.Group", handle["entry/sample/environment"])
        chamber_pressure = cast("h5py.Dataset", environment["chamber_pressure"])
        assert sample.attrs["NX_class"] == "NXsample"
        assert sample.attrs["damnit_nx_class"] == "NXhzdr_target"
        assert sample.attrs["damnit_nxdl_version"] == HZDR_TARGET_PROFILE_VERSION
        assert environment.attrs["NX_class"] == "NXenvironment"
        assert chamber_pressure.attrs["units"] == "mbar"
        assert "pre_shot_pressure" not in environment
        assert "rga_dominant_species" not in environment


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
    assert event["source"] == "DAQ-File-Watchdog"
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


def test_write_nexus_bridge_never_corrupts_existing_output_on_failure(tmp_path: Path):
    """A failure mid-build must leave the previous canonical.nxs intact rather
    than a half-written file. The shot-count mismatch guard (existing_count !=
    len(shots)) is used as a natural injection point: source_nexus has 2 shots
    but shots=[] triggers the guard inside the temp file write, so output_nexus
    is never touched. Confirms the original is still readable and no stale
    .tmp.nxs file was left behind."""
    labfrog_nexus = tmp_path / "labfrog.nxs"
    output_nexus = tmp_path / "canonical.nxs"
    write_labfrog_nexus(labfrog_nexus)

    labfrog_shots = read_labfrog_nexus_shots(labfrog_nexus)
    shots, events = reconcile_canonical_shots(
        [normalized_event()],
        experiment_id="HELPMI",
        source_key="hzdr-labfrog",
        labfrog_shots=labfrog_shots,
    )
    write_nexus_bridge(
        output_path=output_nexus,
        source_nexus=labfrog_nexus,
        experiment_id="HELPMI",
        shots=shots,
        events=events,
    )

    # shots=[] vs source_nexus with 2 shots triggers ValueError inside temp write
    with pytest.raises(ValueError, match="shot count"):
        write_nexus_bridge(
            output_path=output_nexus,
            source_nexus=labfrog_nexus,
            experiment_id="HELPMI",
            shots=[],
            events=[],
        )

    # The canonical file must be intact and still readable
    with h5py.File(output_nexus, "r") as handle:
        assert handle.attrs["experiment_id"] == "HELPMI"
        assert "entry/shots/shot_key" in handle
    # No stale temp files left behind
    assert list(tmp_path.glob("*.tmp.nxs")) == []


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
        host, pid, *_ = lock_path.read_text(encoding="utf-8").split(":")
        assert (host, int(pid)) == (socket.gethostname(), os.getpid())

    assert not lock_path.exists()


# --- Lock hardening: host:pid:start, empty locks, recycled PIDs, age ---


def _age(path: Path, seconds: float) -> None:
    now = time.time()
    os.utime(path, (now - seconds, now - seconds))


def test_the_lock_names_host_pid_and_process_start(tmp_path: Path):
    with single_writer_lock(tmp_path / "c.nxs"):
        text = (tmp_path / "c.nxs.lock").read_text(encoding="utf-8")
    host, pid, start, nonce = text.split(":")
    assert nonce  # unique per acquisition: a release removes only its own lock
    assert host == socket.gethostname()
    assert int(pid) == os.getpid()
    if Path("/proc/self/stat").exists():
        assert start  # Linux: the process start time, which a recycled PID lacks


def test_an_empty_lock_being_written_is_held(tmp_path: Path):
    """Between O_EXCL create and the PID write the file is empty: not stale."""
    (tmp_path / "c.nxs.lock").write_text("", encoding="utf-8")
    with (
        pytest.raises(BuilderAlreadyRunningError),
        single_writer_lock(tmp_path / "c.nxs"),
    ):
        pass  # pragma: no cover


def test_an_empty_lock_left_by_a_crash_is_reclaimed(tmp_path: Path):
    lock = tmp_path / "c.nxs.lock"
    lock.write_text("", encoding="utf-8")
    _age(lock, 60)
    with single_writer_lock(tmp_path / "c.nxs"):
        assert lock.read_text(encoding="utf-8")


@pytest.mark.skipif(not Path("/proc/self/stat").exists(), reason="needs /proc")
def test_a_recycled_pid_on_this_host_is_reclaimed(tmp_path: Path):
    lock = tmp_path / "c.nxs.lock"
    # Our own (alive) PID, but with a start time it never had: a PID reused
    # after the holder died, or after a reboot.
    lock.write_text(f"{socket.gethostname()}:{os.getpid()}:1", encoding="utf-8")
    with single_writer_lock(tmp_path / "c.nxs"):
        pass


def test_a_live_holder_on_this_host_is_respected(tmp_path: Path):
    with (
        single_writer_lock(tmp_path / "c.nxs"),
        pytest.raises(BuilderAlreadyRunningError),
        single_writer_lock(tmp_path / "c.nxs", stale_after=3600),
    ):
        pass  # pragma: no cover


def test_a_legacy_bare_pid_lock_still_works(tmp_path: Path):
    lock = tmp_path / "c.nxs.lock"
    lock.write_text(str(os.getpid()), encoding="utf-8")  # alive: held
    with (
        pytest.raises(BuilderAlreadyRunningError),
        single_writer_lock(tmp_path / "c.nxs"),
    ):
        pass  # pragma: no cover


def test_a_foreign_hosts_lock_is_held_by_the_builder(tmp_path: Path):
    """No way to check another host's PID: the builder never steals it."""
    lock = tmp_path / "c.nxs.lock"
    lock.write_text("some-other-host:1:42", encoding="utf-8")
    _age(lock, 10 * 86400)
    with (
        pytest.raises(BuilderAlreadyRunningError, match="some-other-host"),
        single_writer_lock(tmp_path / "c.nxs"),
    ):
        pass  # pragma: no cover


def test_a_lock_not_refreshed_within_stale_after_is_reclaimed(tmp_path: Path):
    lock = tmp_path / "c.nxs.lock"
    lock.write_text("some-other-host:1:42", encoding="utf-8")
    with (
        pytest.raises(BuilderAlreadyRunningError),
        single_writer_lock(tmp_path / "c.nxs", stale_after=600),
    ):
        pass  # pragma: no cover
    _age(lock, 601)
    with single_writer_lock(tmp_path / "c.nxs", stale_after=600):
        pass


def test_the_holder_refreshes_its_lock(tmp_path: Path):
    lock = tmp_path / "c.nxs.lock"
    with single_writer_lock(tmp_path / "c.nxs", stale_after=600) as held:
        _age(lock, 500)
        held.refresh()
        assert time.time() - lock.stat().st_mtime < 5


def test_a_live_holder_on_this_host_is_never_reclaimed_by_age(tmp_path: Path):
    """A worker that stalled (a hung mount read) keeps its lock: the PID decides."""
    lock = tmp_path / "c.nxs.lock"
    with single_writer_lock(tmp_path / "c.nxs", stale_after=60) as held:
        _age(lock, 3600)
        with (
            pytest.raises(BuilderAlreadyRunningError),
            single_writer_lock(tmp_path / "c.nxs", stale_after=60),
        ):
            pass  # pragma: no cover
        assert lock.read_text(encoding="utf-8") == held.record
        held.refresh()


def test_a_holder_whose_lock_was_taken_over_is_told(tmp_path: Path):
    lock = tmp_path / "c.nxs.lock"
    with single_writer_lock(tmp_path / "c.nxs") as held:
        lock.write_text("other-host:1:1:theirs", encoding="utf-8")
        with pytest.raises(LockLostError, match="taken over"):
            held.refresh()
        lock.unlink()
        with pytest.raises(LockLostError, match="gone"):
            held.refresh()
        lock.write_text("other-host:1:1:theirs", encoding="utf-8")
    # The release is nonce-checked: the new holder's lock stays.
    assert lock.read_text(encoding="utf-8") == "other-host:1:1:theirs"


def test_a_guard_another_user_made_read_only_still_serialises(
    tmp_path: Path, monkeypatch
):
    """An operator's run beside the service user's guard: read-only, not an error."""
    from damnit_api.metadata import hzdr_nexus

    guard = tmp_path / "c.nxs.lock.guard"
    guard.write_bytes(b"")
    real_open = os.open
    opened: list[int] = []

    def no_write_access(path, flags, *args):
        if Path(path) == guard and flags & (os.O_RDWR | os.O_WRONLY):
            if flags & os.O_EXCL:
                raise FileExistsError(path)
            raise PermissionError(13, "Permission denied", str(path))
        opened.append(flags)
        return real_open(path, flags, *args)

    monkeypatch.setattr(hzdr_nexus.os, "open", no_write_access)
    with single_writer_lock(tmp_path / "c.nxs"):
        assert (tmp_path / "c.nxs.lock").exists()
    assert not (tmp_path / "c.nxs.lock").exists()


def test_a_new_guard_is_shared_by_every_user(tmp_path: Path):
    with single_writer_lock(tmp_path / "c.nxs"):
        pass
    if os.name != "nt":
        mode = (tmp_path / "c.nxs.lock.guard").stat().st_mode & 0o777
        assert mode == 0o666


# --- The reclaim race: two reclaimers of one stale lock -----------------------


def _race(tmp_path: Path, iterations: int, contenders: int = 6) -> list[int]:
    """Holder counts, one per round of ``contenders`` reclaiming one stale lock."""
    output = tmp_path / "c.nxs"
    lock = tmp_path / "c.nxs.lock"
    counts: list[int] = []
    for _ in range(iterations):
        lock.write_text("rebooted-host:4242:1:dead", encoding="utf-8")
        _age(lock, 3600)
        start = threading.Barrier(contenders)
        finish = threading.Barrier(contenders)
        holders: list[int] = []

        def contend(start=start, finish=finish, holders=holders) -> None:
            start.wait()
            try:
                with single_writer_lock(output, stale_after=60):
                    holders.append(1)
                    finish.wait()  # hold until every contender has tried
                    return
            except BuilderAlreadyRunningError:
                pass
            finish.wait()

        threads = [threading.Thread(target=contend) for _ in range(contenders)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        counts.append(len(holders))
        lock.unlink(missing_ok=True)
    return counts


@pytest.fixture
def wide_window(monkeypatch):
    """Sleep between judging a lock stale and acting on it, to make races likely."""
    from damnit_api.metadata import hzdr_nexus

    real = hzdr_nexus._judge_lock

    def slow(*args, **kwargs):
        verdict = real(*args, **kwargs)
        time.sleep(0.002)
        return verdict

    monkeypatch.setattr(hzdr_nexus, "_judge_lock", slow)


def test_concurrent_reclaimers_of_one_stale_lock_leave_exactly_one_holder(
    tmp_path: Path, wide_window
):
    assert set(_race(tmp_path, iterations=150)) == {1}


@pytest.mark.skipif(
    sys.platform != "linux", reason="probabilistic: needs Linux thread scheduling"
)
def test_the_race_test_catches_unlink_then_create(
    tmp_path: Path, wide_window, monkeypatch
):
    """Mutation: the pre-fix reclaim (no guard, unlink) lets two hold at once."""
    from damnit_api.metadata import hzdr_nexus

    monkeypatch.setattr(
        hzdr_nexus, "_guard", lambda path, **_: contextlib.nullcontext(True)
    )
    monkeypatch.setattr(
        hzdr_nexus,
        "_reclaim",
        lambda lock_path, judged: lock_path.unlink(missing_ok=True),
    )
    assert max(_race(tmp_path, iterations=40)) > 1


def test_a_reclaim_that_moved_a_live_lock_puts_it_back(tmp_path: Path):
    """The tombstone check (the backstop where no kernel lock is available).

    The reclaimer judged one stale lock, but by the time it renamed, another
    process had replaced it with a live one: the content differs, so the live
    lock is restored and the reclaimer gives up.
    """
    from damnit_api.metadata import hzdr_nexus

    lock = tmp_path / "c.nxs.lock"
    lock.write_text("this-host:1:1:live", encoding="utf-8")
    with pytest.raises(BuilderAlreadyRunningError):
        hzdr_nexus._reclaim(lock, "rebooted-host:4242:1:dead")
    assert lock.read_text(encoding="utf-8") == "this-host:1:1:live"
    assert list(tmp_path.glob("*.stale")) == []


def test_a_reclaim_that_lost_the_rename_steps_aside(tmp_path: Path):
    from damnit_api.metadata import hzdr_nexus

    hzdr_nexus._reclaim(tmp_path / "c.nxs.lock", "gone:1:1:x")  # no error
    assert list(tmp_path.iterdir()) == []


def test_a_holder_whose_lock_was_reclaimed_does_not_remove_the_new_one(
    tmp_path: Path,
):
    lock = tmp_path / "c.nxs.lock"
    with single_writer_lock(tmp_path / "c.nxs", stale_after=600):
        # A hung holder: its lock expired and another worker took it.
        lock.write_text("worker-pc-2:7:1:theirs", encoding="utf-8")
    assert lock.read_text(encoding="utf-8") == "worker-pc-2:7:1:theirs"


def test_without_kernel_locks_a_stale_lock_is_not_reclaimed(
    tmp_path: Path, monkeypatch
):
    """A mount with no flock/msvcrt locking (ENOLCK) fails closed.

    The tombstone check alone does not exclude two reclaimers (a third process
    can create while a moved lock is out), so nothing is reclaimed there; a
    free lock is still taken, by O_EXCL alone, which is safe.
    """
    from damnit_api.metadata import hzdr_nexus

    monkeypatch.setattr(hzdr_nexus, "_lock_fd", lambda fd, *_: False)
    lock = tmp_path / "c.nxs.lock"
    lock.write_text("rebooted-host:4242:1:dead", encoding="utf-8")
    _age(lock, 3600)
    with (
        pytest.raises(BuilderAlreadyRunningError, match="no kernel locks"),
        single_writer_lock(tmp_path / "c.nxs", stale_after=60),
    ):
        pass  # pragma: no cover
    lock.unlink()
    with single_writer_lock(tmp_path / "c.nxs", stale_after=60):
        assert lock.read_text(encoding="utf-8").startswith(socket.gethostname())
    assert not lock.exists()


@pytest.mark.skipif(
    sys.platform != "linux", reason="probabilistic: needs Linux thread scheduling"
)
def test_the_tombstone_alone_does_not_close_the_race(
    tmp_path: Path, wide_window, monkeypatch
):
    """Why the fallback fails closed: unguarded, the tombstone reclaim double-holds."""
    from damnit_api.metadata import hzdr_nexus

    monkeypatch.setattr(
        hzdr_nexus, "_guard", lambda path, **_: contextlib.nullcontext(True)
    )
    assert max(_race(tmp_path, iterations=40)) > 1


def test_replace_retries_a_target_held_open_then_gives_up(tmp_path: Path, monkeypatch):
    source, target = tmp_path / "a.tmp", tmp_path / "a.nxs"
    source.write_text("new", encoding="utf-8")
    calls = []
    real = Path.replace

    def busy_twice(self, other):
        calls.append(1)
        if len(calls) <= 2:
            message = "in use by another process"
            raise PermissionError(message)
        return real(self, other)

    monkeypatch.setattr(Path, "replace", busy_twice)
    replace_with_retry(source, target, attempts=5, delay=0)
    assert target.read_text(encoding="utf-8") == "new"
    assert len(calls) == 3

    def always_busy(self, other):
        calls.append(1)
        message = "held"
        raise PermissionError(message)

    source.write_text("again", encoding="utf-8")
    calls.clear()
    monkeypatch.setattr(Path, "replace", always_busy)
    with pytest.raises(PermissionError):
        replace_with_retry(source, target, attempts=3, delay=0)
    assert len(calls) == 3  # bounded


def test_the_master_publish_retries_a_rename_refused_while_read(tmp_path, monkeypatch):
    """Windows refuses to rename over a file open elsewhere (a reader)."""
    from damnit_api.metadata import hzdr_nexus

    seen = []
    real = hzdr_nexus.replace_with_retry

    def spy(source, target, **kwargs):
        seen.append(target)
        return real(source, target, **kwargs)

    monkeypatch.setattr(hzdr_nexus, "replace_with_retry", spy)
    output = tmp_path / "c.nxs"
    hzdr_nexus.write_nexus_bridge(
        output_path=output, experiment_id="c", shots=[], events=[]
    )
    assert seen == [output]


# --- Review sidecar tests ---


def _make_review_event(event_id: str, match_status: str, candidate_shot_keys=None):
    return {
        "event_id": event_id,
        "experiment_id": "HELPMI",
        "source": "DAQ-File-Watchdog",
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


def test_append_review_decision_keeps_rolling_backup(tmp_path: Path):
    """Each append must update a .bak sibling so the sidecar is recoverable
    if the live file is lost. The backup must equal the live sidecar after
    every write, and survive multiple appends."""
    sources_file = tmp_path / "hzdr_sources.json"
    sidecar = review_sidecar_path(sources_file)
    backup = review_sidecar_backup_path(sources_file)

    append_review_decision(
        sources_file,
        source_key="hzdr-labfrog",
        event_id="evt-1",
        action="confirm",
        by="alice",
        shot_key="HELPMI:20260610:000017",
        candidate_shot_keys=["HELPMI:20260610:000017"],
        review_level="REVIEWED",
    )
    assert backup.exists()
    assert backup.read_text(encoding="utf-8") == sidecar.read_text(encoding="utf-8")

    # A second decision must update the backup to include both lines.
    append_review_decision(
        sources_file,
        source_key="hzdr-labfrog",
        event_id="evt-2",
        action="dismiss",
        by="bob",
        review_level="VERIFIED",
    )
    assert backup.read_text(encoding="utf-8") == sidecar.read_text(encoding="utf-8")
    assert backup.read_text(encoding="utf-8").count("\n") == 2


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


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, "shot"),
        ("", "shot"),
        ("misfire", "misfire"),
        (" Calibration ", "calibration"),
        # Unknown values are carried as written, never turned into a shot.
        ("Dud", "Dud"),
    ],
)
def test_labfrog_shot_status_defaults_to_shot_and_keeps_unknown_values(raw, expected):
    assert labfrog_shot_status(raw) == expected


def test_reads_labfrog_sqlite_shot_status_into_metadata(tmp_path: Path):
    sqlite_path = tmp_path / "campaign.sqlite"
    with sqlite3.connect(sqlite_path) as connection:
        connection.execute(
            """
            CREATE TABLE shots (
                mongo_id TEXT PRIMARY KEY,
                shot_number INTEGER,
                date_time TEXT,
                campaign TEXT,
                shot_status TEXT
            )
            """
        )
        connection.executemany(
            "INSERT INTO shots VALUES (?, ?, ?, ?, ?)",
            [
                ("mongo-17", 17, "2026-06-10T12:00:20Z", "HELPMI", "misfire"),
                ("mongo-18", 18, "2026-06-10T12:01:20Z", "HELPMI", "shot"),
            ],
        )

    shots = read_labfrog_sqlite_shots(sqlite_path)

    assert [shot["metadata"]["shot_status"] for shot in shots] == ["misfire", "shot"]


def test_reads_labfrog_sqlite_local_count_onto_the_shot_record(tmp_path: Path):
    """Schema v12 local_count rides the record, not the free-form metadata."""
    sqlite_path = tmp_path / "campaign.sqlite"
    with sqlite3.connect(sqlite_path) as connection:
        connection.execute(
            """
            CREATE TABLE shots (
                mongo_id TEXT PRIMARY KEY,
                shot_number INTEGER,
                date_time TEXT,
                campaign TEXT,
                local_count INTEGER
            )
            """
        )
        connection.executemany(
            "INSERT INTO shots VALUES (?, ?, ?, ?, ?)",
            [
                ("mongo-17", 17, "2026-06-10T12:00:20Z", "HELPMI", 3),
                ("mongo-18", 18, "2026-06-10T12:01:20Z", "HELPMI", None),
            ],
        )

    shots = read_labfrog_sqlite_shots(sqlite_path)

    assert [shot.get("local_count") for shot in shots] == [3, None]
    assert "local_count" not in shots[1], "no count is invented"
    assert [shot["shot_number"] for shot in shots] == [17, 18]
    assert all("local_count" not in shot["metadata"] for shot in shots)


def test_reads_labfrog_sqlite_without_local_count_column(tmp_path: Path):
    """A pre-v12 export has no local_count column and still loads."""
    sqlite_path = tmp_path / "campaign.sqlite"
    with sqlite3.connect(sqlite_path) as connection:
        connection.execute(
            "CREATE TABLE shots (mongo_id TEXT PRIMARY KEY, shot_number INTEGER, "
            "date_time TEXT, campaign TEXT)"
        )
        connection.execute(
            "INSERT INTO shots VALUES (?, ?, ?, ?)",
            ("mongo-17", 17, "2026-06-10T12:00:20Z", "HELPMI"),
        )

    shots = read_labfrog_sqlite_shots(sqlite_path)

    assert ["local_count" in shot for shot in shots] == [False]


def test_reads_labfrog_nexus_shot_status_when_the_projection_has_it(tmp_path: Path):
    nexus_path = tmp_path / "labfrog.nxs"
    write_labfrog_nexus(nexus_path)
    with h5py.File(nexus_path, "a") as handle:
        handle["entry/shots"].create_dataset(  # pyright: ignore[reportAttributeAccessIssue]
            "shot_status",
            data=np.asarray(
                ["misfire", "shot"], dtype=h5py.string_dtype(encoding="utf-8")
            ),
        )

    shots = read_labfrog_nexus_shots(nexus_path)

    assert [shot["metadata"]["shot_status"] for shot in shots] == ["misfire", "shot"]
    assert [shot["authority_shot_number"] for shot in shots] == [17, 18]


def test_old_labfrog_nexus_has_no_authority_numbers(tmp_path: Path):
    nexus_path = tmp_path / "old-labfrog.nxs"
    write_labfrog_nexus(nexus_path)
    with h5py.File(nexus_path, "a") as handle:
        del handle["entry/shots/authority_shot_number"]

    shots = read_labfrog_nexus_shots(nexus_path)

    assert all("authority_shot_number" not in shot for shot in shots)


_EXAMPLE_LABFROG_SQLITE = (
    Path(__file__).resolve().parents[1]
    / "examples"
    / "Example_Campaign_06.2026.light.sqlite"
)


def test_read_labfrog_sqlite_shots_reads_laser_energy_and_shot_variables():
    shots = read_labfrog_sqlite_shots(_EXAMPLE_LABFROG_SQLITE)

    assert [shot["metadata"]["laser"]["pulse_energy"] for shot in shots] == [
        12.25,
        14.0,
        15.75,
        17.5,
        19.25,
    ]
    second = shots[1]["metadata"]
    assert second["gvd"] == 1420.0
    assert second["tw_delay"] == 0.3
    assert "laser_energy" not in second
    assert second["labfrog_variables"]["ICT integrated charge"] == {
        "value": 0.26,
        "unit": "nC",
        "kind": "dynamic_field",
    }


def test_read_labfrog_sqlite_shots_without_shot_variables_table(tmp_path):
    sqlite_path = tmp_path / "labfrog.sqlite"
    with contextlib.closing(sqlite3.connect(sqlite_path)) as connection:
        connection.execute(
            "CREATE TABLE shots (mongo_id TEXT, shot_number INTEGER, "
            "date_time TEXT, campaign TEXT, laser_energy REAL, padding TEXT)"
        )
        connection.execute(
            "INSERT INTO shots VALUES ('m1', 1, '2026-06-15 09:00:00', 'C', 3.5, ?)",
            ("x" * 2048,),
        )
        connection.commit()

    (shot,) = read_labfrog_sqlite_shots(sqlite_path)

    assert shot["metadata"]["laser"] == {"pulse_energy": 3.5}
    assert "labfrog_variables" not in shot["metadata"]


def test_merge_shot_metadata_keeps_labfrog_laser_keys_events_do_not_carry():
    merged = _merge_shot_metadata(
        {"laser": {"pulse_energy": 12.25}, "status": "active"},
        {"laser": {"pulse_duration": 30.0}},
    )

    assert merged == {
        "laser": {"pulse_energy": 12.25, "pulse_duration": 30.0},
        "status": "active",
    }
