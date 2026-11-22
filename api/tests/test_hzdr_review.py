from pathlib import Path

import orjson
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from damnit_api.main import create_app
from damnit_api.metadata.hzdr_nexus import (
    _review_event_api_record,
    load_experiment_ruling_records,
    load_experiment_rulings,
    load_review_decisions,
    review_sidecar_path,
)
from damnit_api.metadata.hzdr_routers import (
    confirm_local_review_event,
    dismiss_local_review_event,
)
from damnit_api.shared.settings import AuthSettings, settings

SOURCE_KEY = "hzdr-local"


def test_review_event_keeps_trigger_number_without_a_matched_shot():
    record = _review_event_api_record({
        "event_id": "evt-701",
        "experiment_id": "exp",
        "source": "DRACO-Trigger",
        "kind": "draco.trigger",
        "timestamp": "2026-05-05T08:17:00Z",
        "shot_number": 701,
        "match_status": "ambiguous",
        "candidate_shot_keys": ["exp:20260505:000001"],
    })

    assert record["shot_number"] == 701
    assert record["candidate_shot_keys"] == ["exp:20260505:000001"]


def test_experiment_ruling_route_persists_named_decision(tmp_path: Path, monkeypatch):
    sources_file = write_review_fixture(tmp_path)
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="disabled"))

    with TestClient(create_app()) as client:
        response = client.post(
            "/metadata/hzdr/experiment-rulings",
            json={"shot_number": 9, "experiment_id": "Pilot_2026", "note": "Logbook"},
        )
        invalid = client.post(
            "/metadata/hzdr/experiment-rulings",
            json={"shot_number": True, "experiment_id": "Pilot_2026"},
        )

    assert response.status_code == 202
    assert response.json()["status"] == "pending_rebuild"
    assert response.json()["rebuild_requested"] is False  # no auto-trigger here
    assert invalid.status_code == 422
    assert load_experiment_rulings([review_sidecar_path(sources_file)]) == {
        9: "Pilot_2026"
    }
    decision_line = review_sidecar_path(sources_file).read_bytes().splitlines()[0]
    decision = orjson.loads(decision_line)
    assert decision["by"] == "hzdr-dev"
    assert decision["note"] == "Logbook"


def test_review_route_lists_unassigned_shots_and_their_rulings(
    tmp_path: Path, monkeypatch
):
    sources_file = write_review_fixture(tmp_path)
    payload = orjson.loads(sources_file.read_bytes())
    shots = payload["sources"][0]["shots"]
    shots[0]["experiment_id_source"] = "labfrog"
    shots.extend([
        {
            "source_key": SOURCE_KEY,
            "shot_number": number,
            "fired_at": "2026-05-05T10:00:00Z",
            "shot_key": f"unassigned:20260505:{number:06d}",
            "match_status": "trigger-only",
            "experiment_id_source": "unassigned",
            "events": [],
            "metadata": {},
        }
        for number in (9, 10)
    ])
    sources_file.write_bytes(orjson.dumps(payload))
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="disabled"))

    with TestClient(create_app()) as client:
        before = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/review")
        client.post(
            "/metadata/hzdr/experiment-rulings",
            json={"shot_number": 9, "experiment_id": "Pilot_2026", "note": "Logbook"},
        )
        # A ruling for a shot that is not unassigned here is not listed.
        client.post(
            "/metadata/hzdr/experiment-rulings",
            json={"shot_number": 1, "experiment_id": "Pilot_2026"},
        )
        after = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/review")
        missing = client.get("/metadata/hzdr/sources/no-such-source/review")

    assert before.status_code == 200
    body = before.json()
    assert [event["event_id"] for event in body["review_events"]] == [
        "evt-ambiguous-1",
        "evt-unmatched-1",
    ]
    assert body["review_events"][0]["shot_number"] == 701
    assert [shot["shot_number"] for shot in body["unassigned_shots"]] == [9, 10]
    assert body["unassigned_shots"][0]["experiment_id_source"] == "unassigned"
    assert body["experiment_rulings"] == []

    rulings = after.json()["experiment_rulings"]
    assert len(rulings) == 1
    assert rulings[0]["shot_number"] == 9
    assert rulings[0]["experiment_id"] == "Pilot_2026"
    assert rulings[0]["by"] == "hzdr-dev"
    assert rulings[0]["note"] == "Logbook"
    assert rulings[0]["at"]
    assert missing.status_code == 404


def test_ruling_records_keep_the_winning_ruling_with_who_and_when(tmp_path: Path):
    sidecar = tmp_path / "hzdr_sources.review.jsonl"
    lines = [
        {"action": "confirm", "event_id": "evt-1", "source_key": SOURCE_KEY},
        {
            "action": "assign_experiment",
            "shot_number": 9,
            "experiment_id": "A_2026",
            "review_level": "VERIFIED",
            "by": "kim",
            "at": "2026-10-03T08:00:00+00:00",
        },
        {
            "action": "assign_experiment",
            "shot_number": 9,
            "experiment_id": "B_2026",
            "review_level": "REVIEWED",
            "by": "lee",
            "at": "2026-10-03T09:00:00+00:00",
        },
        {"action": "assign_experiment", "shot_number": None, "experiment_id": "C"},
    ]
    sidecar.write_bytes(b"\n".join(orjson.dumps(line) for line in lines) + b"\n")

    records = load_experiment_ruling_records([sidecar, tmp_path / "absent.jsonl"])

    assert list(records) == [9]
    assert records[9]["experiment_id"] == "A_2026"
    assert records[9]["by"] == "kim"
    assert load_experiment_rulings([sidecar]) == {9: "A_2026"}


def write_review_fixture(tmp_path: Path) -> Path:
    """Write a source fixture with one ambiguous and one unmatched review event,
    matching the shape write_sources_catalog/confirm_hzdr_review_event expect."""
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": SOURCE_KEY,
                    "title": "HZDR local file fixture",
                    "damnit_path": "damnit/hzdr-local",
                    "metadata": {"facility": "HZDR"},
                    "shots": [
                        {
                            "source_key": SOURCE_KEY,
                            "shot_number": 1,
                            "fired_at": "2026-05-05T08:15:00Z",
                            "shot_key": "exp:20260505:000001",
                            "match_status": "labfrog-only",
                            "events": [],
                            "metadata": {},
                        },
                        {
                            "source_key": SOURCE_KEY,
                            "shot_number": 1,
                            "fired_at": "2026-05-05T08:20:00Z",
                            "shot_key": "exp:20260505:000001",
                            "match_status": "labfrog-only",
                            "events": [],
                            "metadata": {},
                        },
                    ],
                    "review_events": [
                        {
                            "event_id": "evt-ambiguous-1",
                            "experiment_id": "exp",
                            "shot_number": 701,
                            "source": "DRACO-Trigger",
                            "kind": "trigger.pump",
                            "timestamp": "2026-05-05T08:17:00Z",
                            "transport": "kafka",
                            "payload_ref": {"channel_id": "Draco01"},
                            "metadata": {},
                            "match_status": "ambiguous",
                            "match_quality": "ambiguous",
                            "candidate_shot_keys": [
                                "exp:20260505:000001",
                                "exp:20260505:000001",
                            ],
                        },
                        {
                            "event_id": "evt-unmatched-1",
                            "experiment_id": "exp",
                            "source": "DAQ-File-Watchdog",
                            "kind": "watchdog.tps",
                            "timestamp": "2026-05-05T09:45:00Z",
                            "transport": "kafka",
                            "payload_ref": {},
                            "metadata": {},
                            "match_status": "unmatched",
                            "match_quality": None,
                            "candidate_shot_keys": [],
                        },
                    ],
                    "match_summary": {"matched": 0, "ambiguous": 1, "unmatched": 1},
                }
            ]
        })
    )
    return path


def test_confirm_attaches_ambiguous_event_to_chosen_shot(tmp_path: Path):
    sources_file = write_review_fixture(tmp_path)

    source = confirm_local_review_event(
        sources_file,
        source_key=SOURCE_KEY,
        event_id="evt-ambiguous-1",
        shot_key="exp:20260505:000001",
        note="Operator confirmed via console log",
        confirmed_by="alex",
    )

    # exactly one shot absorbed the event (the first one found with that key)
    matched_shots = [shot for shot in source.shots if shot.match_status == "matched"]
    assert len(matched_shots) == 1
    matched_shot = matched_shots[0]
    assert matched_shot.events[0].source == "DRACO-Trigger"
    assert matched_shot.events[0].match_quality == "operator_confirmed"
    assert matched_shot.metadata["match_confirmation_history"][0]["by"] == "alex"

    # removed from review_events and reflected in match_summary
    assert all(event.event_id != "evt-ambiguous-1" for event in source.review_events)
    assert source.match_summary.matched == 1
    assert source.match_summary.ambiguous == 0
    assert source.match_summary.unmatched == 1  # untouched
    assert source.match_summary.confirmed == 1
    assert source.match_summary.dismissed == 0  # untouched

    # persisted to disk, not just returned in-memory
    reloaded = orjson.loads(sources_file.read_bytes())
    reloaded_source = reloaded["sources"][0]
    assert reloaded_source["match_summary"]["matched"] == 1
    assert reloaded_source["match_summary"]["confirmed"] == 1
    assert len(reloaded_source["review_events"]) == 1

    # decision also written to the durable sidecar
    decisions = load_review_decisions(sources_file, SOURCE_KEY)
    assert "evt-ambiguous-1" in decisions
    assert decisions["evt-ambiguous-1"]["action"] == "confirm"
    assert decisions["evt-ambiguous-1"]["review_level"] == "REVIEWED"


def test_confirm_rejects_shot_key_not_in_candidates(tmp_path: Path):
    sources_file = write_review_fixture(tmp_path)

    with pytest.raises(HTTPException) as excinfo:
        confirm_local_review_event(
            sources_file,
            source_key=SOURCE_KEY,
            event_id="evt-ambiguous-1",
            shot_key="exp:99999999:000099",
            note=None,
            confirmed_by="alex",
        )
    assert excinfo.value.status_code == 400


def test_confirm_rejects_non_ambiguous_event(tmp_path: Path):
    sources_file = write_review_fixture(tmp_path)

    with pytest.raises(HTTPException) as excinfo:
        confirm_local_review_event(
            sources_file,
            source_key=SOURCE_KEY,
            event_id="evt-unmatched-1",
            shot_key="exp:20260505:000001",
            note=None,
            confirmed_by="alex",
        )
    assert excinfo.value.status_code == 400


def test_dismiss_acknowledges_unmatched_event_without_attaching_a_shot(
    tmp_path: Path,
):
    sources_file = write_review_fixture(tmp_path)

    source = dismiss_local_review_event(
        sources_file,
        source_key=SOURCE_KEY,
        event_id="evt-unmatched-1",
        note="Known sensor glitch, not a real shot",
        dismissed_by="sam",
    )

    dismissed = next(
        event for event in source.review_events if event.event_id == "evt-unmatched-1"
    )
    assert dismissed.acknowledged is True
    assert dismissed.acknowledged_by == "sam"
    assert dismissed.acknowledged_note == "Known sensor glitch, not a real shot"
    # still listed (audit trail), but excluded from the unmatched count
    assert len(source.review_events) == 2
    assert source.match_summary.unmatched == 0
    assert source.match_summary.dismissed == 1
    assert source.match_summary.confirmed == 0  # untouched
    assert source.match_summary.ambiguous == 1  # untouched

    # decision written to the durable sidecar
    decisions = load_review_decisions(sources_file, SOURCE_KEY)
    assert "evt-unmatched-1" in decisions
    assert decisions["evt-unmatched-1"]["action"] == "dismiss"
    assert decisions["evt-unmatched-1"]["review_level"] == "REVIEWED"


def test_dismiss_rejects_ambiguous_event(tmp_path: Path):
    sources_file = write_review_fixture(tmp_path)

    with pytest.raises(HTTPException) as excinfo:
        dismiss_local_review_event(
            sources_file,
            source_key=SOURCE_KEY,
            event_id="evt-ambiguous-1",
            note=None,
            dismissed_by="sam",
        )
    assert excinfo.value.status_code == 400


def test_confirm_unknown_event_id_returns_404(tmp_path: Path):
    sources_file = write_review_fixture(tmp_path)

    with pytest.raises(HTTPException) as excinfo:
        confirm_local_review_event(
            sources_file,
            source_key=SOURCE_KEY,
            event_id="evt-does-not-exist",
            shot_key="exp:20260505:000001",
            note=None,
            confirmed_by="alex",
        )
    assert excinfo.value.status_code == 404


def test_review_route_gives_candidate_gaps_in_the_campaign_timezone(
    tmp_path: Path, monkeypatch
):
    sources_file = write_review_fixture(tmp_path)
    payload = orjson.loads(sources_file.read_bytes())
    source = payload["sources"][0]
    # LabFrog times are naive campaign-local times (Berlin, UTC+2 in May).
    for shot, key, local in zip(
        source["shots"],
        ("exp:20260505:000001", "exp:20260505:000002"),
        ("2026-05-05 10:15:00", "2026-05-05T10:20:00"),
        strict=True,
    ):
        shot["shot_key"] = key
        shot["labfrog_date_time"] = local
    source["review_events"][0]["candidate_shot_keys"] = [
        "exp:20260505:000001",
        "exp:20260505:000002",
        "exp:gone",
    ]
    sources_file.write_bytes(orjson.dumps(payload))
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings.hzdr_builder, "campaign_timezone", "Europe/Berlin")
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="disabled"))

    with TestClient(create_app()) as client:
        body = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/review").json()

    # The event at 08:17Z: 2 min after the first shot, 3 min before the
    # second; a candidate not in the catalog and an event with no candidate
    # are left out.
    assert body["candidate_gaps_s"] == {
        "evt-ambiguous-1": {
            "exp:20260505:000001": 120.0,
            "exp:20260505:000002": -180.0,
        }
    }


def test_review_route_gives_the_runner_up_over_every_shot(tmp_path: Path, monkeypatch):
    """plan-aligner-bridge B1: one candidate, but another shot was close."""
    sources_file = write_review_fixture(tmp_path)
    payload = orjson.loads(sources_file.read_bytes())
    source = payload["sources"][0]
    for shot, key, local in zip(
        source["shots"],
        ("exp:20260505:000001", "exp:20260505:000002"),
        ("2026-05-05 10:15:00", "2026-05-05T10:20:00"),
        strict=True,
    ):
        shot["shot_key"] = key
        shot["labfrog_date_time"] = local
    # As under A7: the nearest shot is the only candidate.
    source["review_events"][0]["candidate_shot_keys"] = ["exp:20260505:000001"]
    sources_file.write_bytes(orjson.dumps(payload))
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings.hzdr_builder, "campaign_timezone", "Europe/Berlin")
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="disabled"))

    with TestClient(create_app()) as client:
        body = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/review").json()

    assert body["candidate_gaps_s"] == {
        "evt-ambiguous-1": {"exp:20260505:000001": 120.0}
    }
    # The second shot, 3 min after the event, though it is no candidate.
    assert body["runner_up_gaps_s"] == {"evt-ambiguous-1": -180.0}
