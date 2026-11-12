"""Prove the local HZDR vertical slice end to end, from a clean state.

emulator events -> HZDREventV1 -> JSONL staging -> catalog rebuild
-> review API -> Confirm Matches -> export hook (NeXus/HDF5)

This script needs nothing outside this repository - no sibling checkout, no
Docker, no Mongo/Kafka/ASAPO. It writes a couple of minimal HZDREventV1-shaped
JSONL events (the staging step) plus a tiny synthetic LabFrog shot table (the
same shape api/tests/test_hzdr_integration.py uses, not the real curated
data - see hzdr/docs/status/handoff.md for why), runs them through the same
reconcile/build functions hzdr-hdf5-builder.py uses, then boots the real
FastAPI app in-process and exercises the actual HTTP review/confirm/dismiss
routes against the rebuilt catalog.

Usage:

    cd api
    uv run python scripts/hzdr-local-acceptance.py
    uv run python scripts/hzdr-local-acceptance.py --keep  # inspect output after
    uv run python scripts/hzdr-local-acceptance.py --real-topology

``--real-topology`` rehearses the deployed flow instead (flow mesh plan step
6): the shot authority's ``unassigned`` triggers and a DAQ File Watchdog's
attributed file event in a Kafka-style spool, a LabFrog export and a campaign
schedule, built by the real multi-campaign builder; then a reviewer's ruling
over HTTP and the rebuild that moves the shot. Still nothing outside this
repository, and still a rehearsal: it is never evidence about the server.

Exits non-zero (and prints which step failed) if any step does not hold.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "api" / "src"))

EXPERIMENT_ID = "hzdr-local-acceptance"
SOURCE_KEY = "hzdr-local-acceptance"
SEMANTIC_FIXTURE = (
    REPO_ROOT / "api" / "tests" / "fixtures" / "semantic-golden-domain.synthetic.json"
)
SEMANTIC_EVENT_ID = "acc-evt-semantic-2"
BUILDER_SCRIPT = REPO_ROOT / "api" / "scripts" / "hzdr-hdf5-builder.py"

# --real-topology: three campaigns, one for each way a shot gets its campaign.
LABFROG_CAMPAIGN = "Rehearsal_LabFrog_2026"  # has a LabFrog export
SCHEDULE_CAMPAIGN = "Rehearsal_Schedule_2026"  # only a schedule window
UNASSIGNED_SOURCE_KEY = "unassigned"
REHEARSAL_SHOTS = {
    # shot number: (trigger time UTC, how the campaign is found)
    1: ("2026-06-10T10:00:00+00:00", "labfrog"),
    2: ("2026-06-10T10:05:00+00:00", "labfrog"),
    3: ("2026-06-12T10:00:00+00:00", "schedule"),
    4: ("2026-06-14T10:00:00+00:00", "unassigned"),  # until a reviewer rules
}


def write_minimal_labfrog_sqlite(path: Path) -> None:
    """Write a tiny, synthetic shots table - same schema as a real LabFrog
    curated export (see GitLab/labfrog-sqlite-tools-repo's MANIFEST.txt) but
    no real shot data, names, or comments. One deliberate same-day/
    same-shot_number collision (shot_number=1 twice on 2026-01-01, both
    active and equidistant from the shot-1 event) so the matcher has a genuine
    ambiguous case to put in front of Confirm Matches, plus one clean
    shot_number=2 that should match without review.

    Schema 13: every row carries the shot authority's number it claimed
    (``authority_shot_number``), and under readiness ruling R3 an event's
    ``shot_number`` matches rows on that number alone. The collision is
    therefore two active rows claiming the *same* authority shot - a
    duplicated record, as real exports contain - which the matcher cannot
    resolve by itself. A row whose number was only typed would never be a
    candidate at all, and the shot-1 event would come out unmatched.

    Both shot-1 rows must be `active`: an archived+active pair is a version
    supersession the matcher correctly collapses (see
    hzdr_nexus._mark_superseded_labfrog_rows), which is *not* ambiguous.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.execute("""
            CREATE TABLE shots (
                mongo_id TEXT PRIMARY KEY,
                shot_number INTEGER,
                version INTEGER,
                date_time TEXT,
                campaign TEXT,
                status TEXT,
                target TEXT,
                target_name TEXT,
                target_material TEXT,
                target_thickness_value REAL,
                target_thickness_unit TEXT,
                target_notes TEXT,
                target_source TEXT,
                target_series_sample TEXT,
                authority_shot_number INTEGER
            )
        """)
        connection.executemany(
            "INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                # Two distinct *active* records, same day, same shot_number: a
                # shot-numbering collision the matcher cannot auto-resolve. Both
                # survive supersede filtering (both active) and sit equidistant
                # (+/-2 s) from the LaserData shot-1 event at 09:00:02, so time
                # disambiguation ties -> a genuine ambiguous case for Confirm
                # Matches.
                (
                    "acc-shot-1a",
                    1,
                    0,
                    "2026-01-01T09:00:00",
                    EXPERIMENT_ID,
                    "active",
                    "OTHER: synthetic Kapton witness",
                    "Synthetic Kapton witness",
                    "Kapton",
                    0.5,
                    "um",
                    "Synthetic acceptance fixture; not facility data",
                    "operator",
                    "SYN-01",
                    1,
                ),
                (
                    "acc-shot-1b",
                    1,
                    0,
                    "2026-01-01T09:00:04",
                    EXPERIMENT_ID,
                    "active",
                    "OTHER: synthetic Kapton witness",
                    "Synthetic Kapton witness",
                    "Kapton",
                    0.5,
                    "um",
                    "Synthetic acceptance fixture; not facility data",
                    "operator",
                    "SYN-01",
                    1,
                ),
                # One unambiguous shot.
                (
                    "acc-shot-2-v0",
                    2,
                    0,
                    "2026-01-01T09:10:00",
                    EXPERIMENT_ID,
                    "active",
                    "OTHER: synthetic Kapton witness",
                    "Synthetic Kapton witness",
                    "Kapton",
                    0.5,
                    "um",
                    "Synthetic acceptance fixture; not facility data",
                    "operator",
                    "SYN-01",
                    2,
                ),
            ],
        )
        connection.commit()


def write_staged_events(events_dir: Path) -> list[Path]:
    """Write minimal HZDREventV1-shaped JSONL events - the staging step.

    Three producers, not just one, so the rebuilt catalog/review payload
    shows real producer diversity rather than only ever exercising
    LaserData's adapter-free path:

    - LaserData (shot_number=1): lands on the ambiguous LabFrog pair, by
      design - exercises "ambiguous".
    - LaserData (shot_number=99): matches nothing, by design - exercises
      "unmatched".
    - DAQ File Watchdog (shot_number=2, via normalize_watchdog_document): a
      raw watchdog-shaped document, adapted the same way a real watchdog
      consumer would adapt it before staging.
    - DRACO-Trigger (shot_number=2, via normalize_processed_trigger_message):
      a raw legacy trigger payload, same adapter the shotcounter/DRACO
      boundary uses. Both land on the same clean shot_number=2 match so that
      shot ends up multi-producer-matched, not just multi-event.
    """
    from damnit_api.metadata.hzdr_nexus import (
        normalize_processed_trigger_message,
        normalize_watchdog_document,
    )

    events_dir.mkdir(parents=True, exist_ok=True)

    def laser_event(
        *, shot_number: int, event_id: str, timestamp: str
    ) -> dict[str, Any]:
        return {
            "schema_version": "hzdr-event-v1",
            "event_id": event_id,
            "experiment_id": EXPERIMENT_ID,
            "shot_id": f"shot-{shot_number:06d}",
            "shot_number": shot_number,
            "source": "LaserData",
            "kind": "pulse_energy_j",
            "timestamp": timestamp,
            "transport": "asapo",
            "payload_ref": {"stream": "laser", "message_id": shot_number},
            "values": [12.4 + shot_number * 0.1],
            "metadata": {"unit": "J"},
        }

    laserdata_path = events_dir / "laserdata.jsonl"
    laser_events = [
        laser_event(
            shot_number=1, event_id="acc-evt-1", timestamp="2026-01-01T09:00:02Z"
        ),
        laser_event(
            shot_number=99, event_id="acc-evt-3", timestamp="2026-01-01T12:00:00Z"
        ),
    ]
    with laserdata_path.open("w", encoding="utf-8") as handle:
        for record in laser_events:
            handle.write(json.dumps(record, sort_keys=True) + "\n")

    watchdog_event = normalize_watchdog_document(
        {
            "shot_id": "shot-000002",
            "timestamp": "2026-01-01T09:10:03Z",
            "watch": {"watch_name": "acceptance check"},
            "event": {
                "filename": "shot-2.csv",
                "filepath": "Z:/acceptance/shot-2.csv",
            },
            "analysis": {"data": {"shot": 2, "energy": 8.1}},
            "_kafka": {"topic": "planet.watchdog.events", "offset": 1},
        },
        experiment_id=EXPERIMENT_ID,
    )
    watchdog_event["event_id"] = "acc-evt-watchdog-2"
    watchdog_path = events_dir / "watchdog.jsonl"
    watchdog_path.write_text(
        json.dumps(watchdog_event, sort_keys=True) + "\n", encoding="utf-8"
    )

    trigger_event = normalize_processed_trigger_message({
        "processed_message": {
            "Name": "Draco01",
            "Campaign": EXPERIMENT_ID,
            "nickname": "acceptance_trigger",
            "trigger_role": "pump",
            "threshold": 0.25,
            "adc_value": 0.81,
            "channel_trigger_count": 1,
            "run_id": 1,
            "timestamp": "2026-01-01T09:10:04Z",
            "sample_counter_10hz": 1,
            "shot_number": 2,
        },
        "_kafka": {
            "topic": "Draco01",
            "partition": 0,
            "offset": 1,
            "key": "processed_message",
        },
    })
    trigger_event["event_id"] = "acc-evt-trigger-2"
    trigger_path = events_dir / "trigger.jsonl"
    trigger_path.write_text(
        json.dumps(trigger_event, sort_keys=True) + "\n", encoding="utf-8"
    )

    semantic_event = json.loads(SEMANTIC_FIXTURE.read_text(encoding="utf-8"))
    semantic_path = events_dir / "semantic-domain.jsonl"
    semantic_path.write_text(
        json.dumps(semantic_event, sort_keys=True) + "\n", encoding="utf-8"
    )

    return [laserdata_path, watchdog_path, trigger_path, semantic_path]


def verify_semantic_nexus(path: Path) -> None:
    """Assert that every synthetic domain block survives into its NeXus home."""
    import h5py

    def group(parent: h5py.Group, name: str) -> h5py.Group:
        value = parent[name]
        assert isinstance(value, h5py.Group)
        return value

    def dataset(parent: h5py.Group, name: str) -> h5py.Dataset:
        value = parent[name]
        assert isinstance(value, h5py.Dataset)
        return value

    fixture = json.loads(SEMANTIC_FIXTURE.read_text(encoding="utf-8"))
    with h5py.File(path, "r") as handle:
        entry = group(handle, "entry")
        assert dataset(entry, "definition").asstr()[()] == "NXhzdr_target"

        sample = group(entry, "sample")
        assert sample.attrs["NX_class"] == "NXsample"
        assert dataset(sample, "name").asstr()[()] == "Synthetic Kapton witness"
        assert dataset(sample, "material").asstr()[()] == "Kapton"
        thickness = dataset(sample, "thickness")
        assert math.isclose(thickness[()], 500.0)
        assert thickness.attrs["units"] == "nm"
        assert sample.attrs["damnit_provenance"] == "manual"

        instrument = group(entry, "instrument")
        laser = group(instrument, "laser")
        assert dataset(laser, "name").asstr()[()] == "DRACO synthetic"
        assert dataset(laser, "probe").asstr()[()] == "visible light"
        frequency = dataset(laser, "frequency")
        assert math.isclose(frequency[()], 10.0)
        assert frequency.attrs["units"] == "Hz"
        pulse_energy = dataset(laser, "pulse_energy")
        assert math.isclose(pulse_energy[()], 8.2)
        assert pulse_energy.attrs["units"] == "J"
        beam = group(laser, "beam")
        assert dataset(beam, "pulse_duration").attrs["units"] == "fs"
        assert dataset(beam, "incident_wavelength").attrs["units"] == "nm"
        assert dataset(beam, "incident_polarization").asstr()[()] == "horizontal"
        # Producer-supplied, so unmarked: only laser_config fills carry
        # damnit_source="config" (nexus-semantic-maps.md §2.4).
        assert "damnit_source" not in dataset(beam, "incident_wavelength").attrs

        shots = group(entry, "shots")
        shot_keys = list(dataset(shots, "shot_key").asstr()[...])
        shot_index = shot_keys.index(f"{EXPERIMENT_ID}:20260101:000002")
        shot_series = group(laser, "shot_series")
        shot_pulse_energy = dataset(shot_series, "pulse_energy")
        assert math.isclose(shot_pulse_energy[shot_index], 8.2)
        assert shot_pulse_energy.attrs["units"] == "J"

        environment = group(sample, "environment")
        chamber_pressure = dataset(environment, "chamber_pressure")
        assert math.isclose(chamber_pressure[()], 2.4e-6)
        assert chamber_pressure.attrs["units"] == "mbar"
        assert math.isclose(dataset(environment, "pre_shot_pressure")[()], 1.1e-6)
        assert dataset(environment, "rga_dominant_species").asstr()[()] == "H2O"

        xray = dataset(group(instrument, "xray_counts"), "data")
        assert math.isclose(xray[shot_index], 1450.0)
        assert xray.attrs["units"] == "counts"
        assert math.isclose(
            dataset(group(instrument, "detector_signal_mean"), "data")[shot_index],
            2.25,
        )
        assert math.isclose(
            dataset(group(instrument, "alignment_score"), "data")[shot_index],
            0.98,
        )

        source_events = group(entry, "source_events")
        event_ids = list(dataset(source_events, "event_id").asstr()[...])
        event_index = event_ids.index(SEMANTIC_EVENT_ID)
        metadata = json.loads(
            str(dataset(source_events, "metadata_json").asstr()[event_index])
        )
        assert metadata == fixture["metadata"]
        payload_ref = json.loads(
            str(dataset(source_events, "payload_ref_json").asstr()[event_index])
        )
        assert payload_ref == fixture["payload_ref"]


def rebuild_catalog(
    *, events_dir: Path, labfrog_sqlite: Path, output_dir: Path
) -> tuple[Path, Path]:
    """Run the same reconcile/build steps hzdr-hdf5-builder.py runs."""
    from damnit_api.metadata.hzdr_nexus import (
        load_normalized_events,
        read_labfrog_sqlite_shots,
        reconcile_canonical_shots,
        write_nexus_bridge,
        write_sources_catalog,
    )

    events = load_normalized_events(sorted(events_dir.glob("*.jsonl")))
    labfrog_shots = read_labfrog_sqlite_shots(labfrog_sqlite)
    shots, normalized_events = reconcile_canonical_shots(
        events,
        experiment_id=EXPERIMENT_ID,
        source_key=SOURCE_KEY,
        labfrog_shots=labfrog_shots,
        campaign_timezone="UTC",
    )

    output_nexus = output_dir / f"{EXPERIMENT_ID}.nxs"
    sources_file = output_dir / "hzdr_sources.json"
    write_nexus_bridge(
        output_path=output_nexus,
        experiment_id=EXPERIMENT_ID,
        shots=shots,
        events=normalized_events,
    )
    write_sources_catalog(
        sources_file=sources_file,
        source_key=SOURCE_KEY,
        experiment_id=EXPERIMENT_ID,
        nexus_path=output_nexus,
        shots=shots,
        events=normalized_events,
    )
    return output_nexus, sources_file


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_event_replay_identity(events_dir: Path) -> list[str]:
    """Load the staged inputs twice and prove stable, unique event identity."""
    from damnit_api.metadata.hzdr_nexus import load_normalized_events

    paths = sorted(events_dir.glob("*.jsonl"))
    first = [event["event_id"] for event in load_normalized_events(paths)]
    second = [event["event_id"] for event in load_normalized_events(paths)]
    assert first == second
    assert len(first) == len(set(first)), "fixture event_id values must be unique"
    return first


def verify_local_scicat_replay(
    *, nexus_path: Path, sources_file: Path, event_ids: list[str]
) -> dict[str, Any]:
    """Prove catalog persistence and unchanged-artifact SciCat POST dedup.

    This deliberately mocks only the remote HTTP response. The DAMNIT request
    builder, source checksum, catalog stamping/readback, and replay skip are the
    production functions. It is local contract evidence, not a production-like
    SciCat deployment.
    """
    from unittest.mock import patch

    import httpx

    from damnit_api.metadata.hzdr_nexus import write_json_atomic
    from damnit_api.metadata.scicat import (
        read_previous_registration,
        register_campaign_nexus,
    )
    from damnit_api.shared.hzdr_settings import HZDRScicatSettings

    calls: list[dict[str, Any]] = []

    def local_post(url, json, timeout):
        calls.append({"url": url, "json": json, "timeout": timeout})
        checksum = json["files"][0]["checksum"]
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            json={
                "ok": True,
                "pid": "synthetic-local/campaign",
                "version_hash": f"local-{checksum[:16]}",
            },
            request=request,
        )

    scicat_settings = HZDRScicatSettings(
        enabled=True,
        plugin_url="http://synthetic-scicat.invalid",
        frontend_url="http://synthetic-scicat.invalid",
        endpoint="push",
    )
    registration_args = {
        "settings": scicat_settings,
        "nexus_path": nexus_path,
        "experiment_id": EXPERIMENT_ID,
        "source_key": SOURCE_KEY,
        "scientific_metadata": {
            "fixtureClassification": "synthetic",
            "eventIds": event_ids,
        },
        "source_folder": str(nexus_path.parent),
    }
    with patch("httpx.post", side_effect=local_post):
        first = register_campaign_nexus(**registration_args)
        assert first is not None
        assert len(calls) == 1

        catalog = json.loads(sources_file.read_text(encoding="utf-8"))
        catalog["sources"][0]["metadata"].update(first)
        write_json_atomic(sources_file, catalog)
        previous = read_previous_registration(sources_file, SOURCE_KEY)
        assert previous == first

        second = register_campaign_nexus(**registration_args, previous=previous)
        assert second == first
        assert len(calls) == 1, "unchanged registration replay must not POST again"

    return {
        "mode": "mocked-local-contract",
        "pid": first["scicat_pid"],
        "versionHash": first["scicat_version_hash"],
        "sourceSha256": first["scicat_source_sha256"],
        "postCountAfterReplay": len(calls),
    }


def write_semantic_evidence_report(
    *,
    path: Path,
    nexus_path: Path,
    sources_file: Path,
    event_ids: list[str],
    scicat: dict[str, Any],
) -> None:
    report = {
        "schemaVersion": 1,
        "classification": "synthetic",
        "experimentId": EXPERIMENT_ID,
        "fixture": {
            "path": SEMANTIC_FIXTURE.name,
            "sha256": sha256_file(SEMANTIC_FIXTURE),
        },
        "normalizedEventIds": event_ids,
        "nexus": {
            "path": nexus_path.name,
            "sha256": sha256_file(nexus_path),
        },
        "catalog": {
            "path": sources_file.name,
            "sha256": sha256_file(sources_file),
        },
        "scicat": scicat,
    }
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


class Step:
    """Print a step header and re-raise with context on failure."""

    def __init__(self, label: str):
        self.label = label

    def __enter__(self) -> Step:
        print(f"\n== {self.label} ==")
        return self

    def __exit__(self, exc_type, exc, _tb) -> Literal[False]:
        if exc_type is None:
            print(f"OK: {self.label}")
            return False
        print(f"FAILED: {self.label}: {exc}", file=sys.stderr)
        return False


def run_acceptance(*, keep: bool, output_dir: Path | None = None) -> bool:
    if output_dir is None:
        work_dir = Path(tempfile.mkdtemp(prefix="hzdr-local-acceptance-"))
    else:
        work_dir = output_dir.resolve()
        if work_dir.exists() and any(work_dir.iterdir()):
            message = f"--output-dir must be absent or empty: {work_dir}"
            raise ValueError(message)
        work_dir.mkdir(parents=True, exist_ok=True)
        keep = True
    ok = True
    try:
        events_dir = work_dir / "events"
        labfrog_sqlite = work_dir / "labfrog.sqlite"
        output_dir = work_dir / "catalog"
        output_nexus = output_dir / f"{EXPERIMENT_ID}.nxs"
        sources_file = output_dir / "hzdr_sources.json"
        evidence_file = output_dir / "semantic-golden-evidence.json"

        # All settings env vars must be set before the first damnit_api
        # import anywhere in this process: Settings() is constructed once,
        # at first import, and later os.environ writes have no effect on the
        # already-built singleton (see api/tests/test_runtime_config.py's
        # test_flow_monitor_producer_options_overridable_via_env for the same
        # caveat documented against a fresh Settings() instead).
        os.environ["DW_API_DAMNIT_PATH"] = str(work_dir)
        os.environ["DW_API_METADATA__PROVIDER"] = "local"
        os.environ["DW_API_METADATA__SOURCES_FILE"] = str(sources_file)

        with Step("Write staged events (JSONL)"):
            staged_paths = write_staged_events(events_dir)
            assert all(path.exists() for path in staged_paths)

        with Step("Replay staged inputs with stable event identity"):
            event_ids = verify_event_replay_identity(events_dir)

        with Step("Write synthetic LabFrog source data"):
            write_minimal_labfrog_sqlite(labfrog_sqlite)

        with Step("Rebuild catalog from staged events"):
            built_nexus, built_sources_file = rebuild_catalog(
                events_dir=events_dir,
                labfrog_sqlite=labfrog_sqlite,
                output_dir=output_dir,
            )
            assert built_nexus == output_nexus
            assert built_sources_file == sources_file
            assert output_nexus.exists(), "export artifact (NeXus) was not written"
            assert sources_file.exists(), "derived catalog was not written"

        with Step("Verify synthetic semantic domains in NeXus"):
            verify_semantic_nexus(output_nexus)

        with Step("Register and replay against local SciCat contract"):
            scicat_evidence = verify_local_scicat_replay(
                nexus_path=output_nexus,
                sources_file=sources_file,
                event_ids=event_ids,
            )

        with Step("Boot API and verify review endpoint sees rebuilt state"):
            from fastapi.testclient import TestClient

            from damnit_api.main import create_app
            from damnit_api.shared.settings import settings

            # Confirm/dismiss require a real user (OAuthUserInfo.from_connection).
            # In local mode with auth=None, that dependency returns DEV_USER with
            # no session needed - the same fallback hzdr-dev.ps1/hzdr-package-
            # emulator.py rely on. Force it explicitly here so this script does
            # not depend on whether the developer's own api/.env happens to set
            # DW_API_AUTH__MODE (most local dev .env files do, for the LDAP
            # login page, which this offline acceptance check has no use for).
            settings.auth = None

            with TestClient(create_app()) as client:
                sources_response = client.get("/metadata/hzdr/sources")
                sources_response.raise_for_status()
                sources_payload = sources_response.json()
                assert any(source["key"] == SOURCE_KEY for source in sources_payload), (
                    f"{SOURCE_KEY} not visible via GET /metadata/hzdr/sources"
                )

                review_response = client.get(
                    f"/metadata/hzdr/sources/{SOURCE_KEY}/review"
                )
                review_response.raise_for_status()
                review_payload = review_response.json()
                summary = review_payload["match_summary"]
                review_events = review_payload["review_events"]
                print(f"  match_summary: {summary}")
                print(f"  review_events: {len(review_events)}")

                assert summary["matched"] >= 1, "expected at least one matched shot"
                ambiguous = [
                    event
                    for event in review_events
                    if event["match_status"] == "ambiguous"
                ]
                unmatched = [
                    event
                    for event in review_events
                    if event["match_status"] == "unmatched"
                ]
                assert ambiguous, (
                    "expected an ambiguous review event (the deliberate "
                    "duplicate shot_number=1 LabFrog row) - fixture or "
                    "matcher behavior changed"
                )
                assert unmatched, (
                    "expected an unmatched review event (shot_number=99) - "
                    "fixture or matcher behavior changed"
                )

            with Step("Confirm Matches: attach the ambiguous event over HTTP"):
                candidate_shot_key = ambiguous[0]["candidate_shot_keys"][0]
                confirm_response = client.post(
                    f"/metadata/hzdr/sources/{SOURCE_KEY}/review/"
                    f"{ambiguous[0]['event_id']}/confirm",
                    json={"shot_key": candidate_shot_key, "note": "acceptance run"},
                )
                confirm_response.raise_for_status()
                confirmed_source = confirm_response.json()
                assert confirmed_source["match_summary"]["confirmed"] == 1
                assert confirmed_source["match_summary"]["ambiguous"] == 0

            with Step("Dismiss the unmatched event over HTTP"):
                dismiss_response = client.post(
                    f"/metadata/hzdr/sources/{SOURCE_KEY}/review/"
                    f"{unmatched[0]['event_id']}/dismiss",
                    json={"note": "acceptance run"},
                )
                dismiss_response.raise_for_status()
                dismissed_source = dismiss_response.json()
                assert dismissed_source["match_summary"]["dismissed"] == 1
                assert dismissed_source["match_summary"]["unmatched"] == 0

            with Step("Re-fetch review: confirm/dismiss are reflected"):
                final_review = client.get(
                    f"/metadata/hzdr/sources/{SOURCE_KEY}/review"
                ).json()
                assert final_review["match_summary"]["confirmed"] == 1
                assert final_review["match_summary"]["dismissed"] == 1
                assert final_review["match_summary"]["ambiguous"] == 0
                assert final_review["match_summary"]["unmatched"] == 0

        with Step("Write synthetic golden evidence report"):
            write_semantic_evidence_report(
                path=evidence_file,
                nexus_path=output_nexus,
                sources_file=sources_file,
                event_ids=event_ids,
                scicat=scicat_evidence,
            )
            assert evidence_file.exists()

        print("\nAll local acceptance steps passed.")
        print(f"Catalog: {sources_file}")
        print(f"Export (NeXus/HDF5): {output_nexus}")
        print(f"Evidence: {evidence_file}")
        print(f"Generated at: {datetime.now(UTC).isoformat()}")
    except AssertionError as exc:
        print(f"\nAcceptance check failed: {exc}", file=sys.stderr)
        ok = False
    except Exception as exc:
        print(f"\nUnexpected error: {exc}", file=sys.stderr)
        ok = False
    finally:
        if keep:
            print(f"\n--keep set: left local state at {work_dir}")
        else:
            shutil.rmtree(work_dir, ignore_errors=True)
    return ok


def write_rehearsal_spool(spool: Path) -> dict[str, Any]:
    """Spool the events the real producers send, all of them ``unassigned``.

    The envelopes are the flow-monitor emulator's, which are planet-watchdog's
    ``shot_authority.trigger_event`` and ``kafka_output`` shapes: one trigger
    per shot, and one attributed file event from the Ions watchdog PC for
    shot 1. Both topics land in the one spool file, as on the server.
    """
    from damnit_api.metadata.hzdr_event import HZDREventV1
    from damnit_api.metadata.hzdr_routers import (
        _emulated_trigger_event,
        _emulated_watchdog_event,
    )

    events = [
        _emulated_trigger_event(
            shot_number=number,
            fired_at=fired_at,
            metadata={"emulated_sequence": number},
        )
        for number, (fired_at, _) in REHEARSAL_SHOTS.items()
    ]
    file_event = _emulated_watchdog_event(
        campaign=LABFROG_CAMPAIGN,
        shot_number=1,
        fired_at=REHEARSAL_SHOTS[1][0],
        metadata={},
    )
    events.append(file_event)
    for event in events:
        HZDREventV1.model_validate(event)
        assert event["experiment_id"] == UNASSIGNED_SOURCE_KEY
    path = spool / "_unassigned" / "trigger.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(event, sort_keys=True) + "\n" for event in events),
        encoding="utf-8",
    )
    return file_event


def write_rehearsal_export(curated_root: Path) -> None:
    """A curated LabFrog export whose rows claim the authority's shots 1 and 2."""
    folder = curated_root / LABFROG_CAMPAIGN
    folder.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(folder / f"{LABFROG_CAMPAIGN}.sqlite")
    try:
        connection.execute(
            "CREATE TABLE shots (mongo_id TEXT PRIMARY KEY, shot_number INTEGER, "
            "date_time TEXT, date_time_utc TEXT, campaign TEXT, experiment_id TEXT, "
            "authority_shot_number INTEGER)"
        )
        for number in (1, 2):
            utc = datetime.fromisoformat(REHEARSAL_SHOTS[number][0])
            connection.execute(
                "INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    f"{LABFROG_CAMPAIGN}-{number}",
                    number,
                    utc.strftime("%Y-%m-%dT%H:%M:%S"),
                    utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    LABFROG_CAMPAIGN.replace("_", " "),
                    None,
                    number,
                ),
            )
        connection.commit()
    finally:
        connection.close()


def write_rehearsal_schedule(path: Path) -> None:
    """A ``labfrog-campaign-schedule-v1`` export: one window per campaign."""
    document = {
        "schema": "labfrog-campaign-schedule-v1",
        "timezone": "UTC",
        "window_rule": "[start 00:00, end+1 00:00) local time in `timezone`",
        "campaigns": [
            {
                "campaign": LABFROG_CAMPAIGN.replace("_", " "),
                "experiment_id": LABFROG_CAMPAIGN,
                "start": "2026-06-10",
                "end": "2026-06-10",
                "source": "rehearsal",
            },
            {
                "campaign": SCHEDULE_CAMPAIGN.replace("_", " "),
                "experiment_id": SCHEDULE_CAMPAIGN,
                "start": "2026-06-12",
                "end": "2026-06-12",
                "source": "rehearsal",
            },
        ],
        "warnings": [],
    }
    path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def run_multi_campaign_builder(
    *, spool: Path, curated_root: Path, schedule: Path, output_root: Path
) -> None:
    """Run the real builder the way the auto-trigger does in multi-campaign mode."""
    env = dict(os.environ)
    # A developer's api/.env may enable SciCat; a rehearsal never posts.
    env["DW_API_HZDR_SCICAT__ENABLED"] = "false"
    command = [
        sys.executable,
        str(BUILDER_SCRIPT),
        "--output-root",
        str(output_root),
        "--curated-root",
        str(curated_root),
        "--trigger-spool",
        str(spool),
        "trigger.jsonl",
        "--campaign",
        LABFROG_CAMPAIGN,
        "--campaign-schedule",
        str(schedule),
        "--campaign-timezone",
        "UTC",
    ]
    result = subprocess.run(
        command, env=env, capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        message = (
            f"builder exited {result.returncode}:\n{result.stdout}\n{result.stderr}"
        )
        raise AssertionError(message)


def rehearsal_shots(sources_file: Path) -> dict[str, dict[int, dict[str, Any]]]:
    """``{source key: {shot number: shot}}`` from the shared catalog."""
    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    return {
        source["key"]: {shot["shot_number"]: shot for shot in source["shots"]}
        for source in payload["sources"]
    }


def run_real_topology(*, keep: bool, output_dir: Path | None = None) -> bool:
    """Rehearse the deployed topology end to end (flow mesh plan step 6)."""
    if output_dir is None:
        work_dir = Path(tempfile.mkdtemp(prefix="hzdr-real-topology-"))
    else:
        work_dir = output_dir.resolve()
        if work_dir.exists() and any(work_dir.iterdir()):
            message = f"--output-dir must be absent or empty: {work_dir}"
            raise ValueError(message)
        work_dir.mkdir(parents=True, exist_ok=True)
        keep = True
    ok = True
    try:
        spool = work_dir / "spool" / "kafka"
        curated_root = work_dir / "curated_files"
        schedule = work_dir / "campaign-schedule.json"
        output_root = work_dir / "nexus"
        sources_file = output_root / "hzdr_sources.json"

        # Before the first damnit_api import; see run_acceptance.
        os.environ["DW_API_DAMNIT_PATH"] = str(work_dir)
        os.environ["DW_API_METADATA__PROVIDER"] = "local"
        os.environ["DW_API_METADATA__SOURCES_FILE"] = str(sources_file)

        def build() -> dict[str, dict[int, dict[str, Any]]]:
            run_multi_campaign_builder(
                spool=spool,
                curated_root=curated_root,
                schedule=schedule,
                output_root=output_root,
            )
            return rehearsal_shots(sources_file)

        with Step("Spool the shot authority's triggers and a watchdog file event"):
            file_event = write_rehearsal_spool(spool)

        with Step("Write the LabFrog export and the campaign schedule"):
            write_rehearsal_export(curated_root)
            write_rehearsal_schedule(schedule)

        with Step("Build every campaign with the multi-campaign builder"):
            shots = build()
            assert set(shots) == {
                LABFROG_CAMPAIGN,
                SCHEDULE_CAMPAIGN,
                UNASSIGNED_SOURCE_KEY,
            }, f"unexpected sources: {sorted(shots)}"

        with Step("Each shot is in the campaign its resolution step names"):
            placed = {
                number: (key, shot["experiment_id_source"])
                for key, by_number in shots.items()
                for number, shot in by_number.items()
            }
            print(f"  shots: {placed}")
            assert placed == {
                1: (LABFROG_CAMPAIGN, "labfrog"),
                2: (LABFROG_CAMPAIGN, "labfrog"),
                3: (SCHEDULE_CAMPAIGN, "schedule"),
                4: (UNASSIGNED_SOURCE_KEY, "unassigned"),
            }, f"campaign resolution changed: {placed}"

        with Step("The watchdog file follows its shot, PC and instrument named"):
            import h5py

            sources = {
                event["source"] for event in shots[LABFROG_CAMPAIGN][1]["events"]
            }
            assert sources >= {"DRACO-Trigger", "DAQ-File-Watchdog"}, sources
            nexus = output_root / LABFROG_CAMPAIGN / f"{LABFROG_CAMPAIGN}.nxs"
            with h5py.File(nexus, "r") as handle:

                def column(path: str) -> list[str]:
                    dataset = handle[path]
                    assert isinstance(dataset, h5py.Dataset), path
                    return [str(value) for value in dataset.asstr()[...]]

                row = column("entry/source_events/event_id").index(
                    file_event["event_id"]
                )
                instance = column("entry/source_events/producer_instance_id")[row]
                instrument = column("entry/source_events/instrument_id")[row]
                how = set(column("entry/shots/experiment_id_source"))
            assert instance == file_event["metadata"]["producer"]["instance_id"]
            assert instrument == file_event["metadata"]["instrument"]["id"]
            assert how == {"labfrog"}, how

        with Step("Boot API: the unassigned shot waits in Review matches"):
            from fastapi.testclient import TestClient

            from damnit_api.main import create_app
            from damnit_api.shared.settings import settings

            settings.auth = None  # see run_acceptance

            with TestClient(create_app()) as client:
                review = client.get(
                    f"/metadata/hzdr/sources/{UNASSIGNED_SOURCE_KEY}/review"
                )
                review.raise_for_status()
                waiting = [
                    shot["shot_number"] for shot in review.json()["unassigned_shots"]
                ]
                assert waiting == [4], f"unassigned shots: {waiting}"

                with Step("Rule over HTTP: shot 4 belongs to the schedule campaign"):
                    ruling = client.post(
                        "/metadata/hzdr/experiment-rulings",
                        json={
                            "shot_number": 4,
                            "experiment_id": SCHEDULE_CAMPAIGN,
                            "note": "real-topology rehearsal",
                        },
                    )
                    assert ruling.status_code == 202, ruling.text
                    assert ruling.json()["status"] == "pending_rebuild"

                with Step("Rebuild: the ruling moves the shot out of the bucket"):
                    shots = build()
                    assert set(shots[UNASSIGNED_SOURCE_KEY]) == set(), shots[
                        UNASSIGNED_SOURCE_KEY
                    ]
                    moved = shots[SCHEDULE_CAMPAIGN]
                    assert set(moved) == {3, 4}, sorted(moved)
                    assert moved[4]["experiment_id_source"] == "ruling"
                    assert moved[3]["experiment_id_source"] == "schedule"
                    assert set(shots[LABFROG_CAMPAIGN]) == {1, 2}

                with Step("Re-fetch review: nothing is left unassigned"):
                    review = client.get(
                        f"/metadata/hzdr/sources/{UNASSIGNED_SOURCE_KEY}/review"
                    )
                    review.raise_for_status()
                    assert review.json()["unassigned_shots"] == []

        print("\nAll real-topology rehearsal steps passed.")
        print(f"Catalog: {sources_file}")
        print(f"Output root: {output_root}")
        print(f"Generated at: {datetime.now(UTC).isoformat()}")
    except AssertionError as exc:
        print(f"\nRehearsal check failed: {exc}", file=sys.stderr)
        ok = False
    except Exception as exc:
        print(f"\nUnexpected error: {exc}", file=sys.stderr)
        ok = False
    finally:
        if keep:
            print(f"\n--keep set: left local state at {work_dir}")
        else:
            shutil.rmtree(work_dir, ignore_errors=True)
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Do not delete the generated temp directory; print its path instead.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Write the inspectable synthetic bundle to a new or empty directory.",
    )
    parser.add_argument(
        "--real-topology",
        action="store_true",
        help=(
            "Rehearse the deployed flow instead: unassigned triggers, a LabFrog "
            "export, a campaign schedule, the multi-campaign builder and a "
            "reviewer's ruling."
        ),
    )
    args = parser.parse_args()

    run = run_real_topology if args.real_topology else run_acceptance
    if not run(keep=args.keep, output_dir=args.output_dir):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
