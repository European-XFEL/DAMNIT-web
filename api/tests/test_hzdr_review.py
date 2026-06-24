from pathlib import Path

import orjson
import pytest
from fastapi import HTTPException

from damnit_api.metadata.hzdr_nexus import load_review_decisions
from damnit_api.metadata.routers import (
    confirm_local_review_event,
    dismiss_local_review_event,
)

SOURCE_KEY = "hzdr-local"


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
