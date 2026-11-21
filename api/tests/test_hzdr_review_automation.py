"""Review matches made more automatic (hzdr/docs/plans/plan-review-automation.md).

The first group pins what the matcher does today with time-only events
(characterization, before the one-to-one rule): every later change in this
plan shows here as a moved outcome.
"""

from typing import Any

from damnit_api.metadata.hzdr_nexus import reconcile_canonical_shots

EXPERIMENT = "HELPMI"


def labfrog_row(record_id: str, time: str, number: int | None = None) -> dict[str, Any]:
    """A LabFrog record of 2026-06-10; no authority number unless given."""
    row: dict[str, Any] = {
        "record_id": record_id,
        "shot_number": number if number is not None else 900 + len(record_id),
        "shot_date": "2026-06-10",
        "labfrog_date_time": time,
        "metadata": {},
    }
    if number is not None:
        row["authority_shot_number"] = number
    return row


def trigger(event_id: str, time: str, shot_number: int | None = None, **extra: Any):
    """A DRACO trigger; no authority number unless given."""
    event = {
        "event_id": event_id,
        "experiment_id": EXPERIMENT,
        "shot_id": f"shot-{event_id}",
        "source": "DRACO-Trigger",
        "kind": "draco.trigger",
        "timestamp": time,
        "transport": "kafka",
        "payload_ref": {"topic": "draco", "partition": 0, "offset": event_id},
        "values": None,
        "metadata": {},
    }
    if shot_number is not None:
        event["shot_number"] = shot_number
    event.update(extra)
    return event


def outcome(events: list[dict[str, Any]], event_id: str) -> tuple[str, str, list[str]]:
    event = next(item for item in events if item["event_id"] == event_id)
    return (
        event["match_status"],
        event.get("shot_key", ""),
        list(event.get("candidate_shot_keys") or []),
    )


def build(events, rows, **options):
    return reconcile_canonical_shots(
        events,
        experiment_id=EXPERIMENT,
        source_key="hzdr-labfrog",
        labfrog_shots=rows,
        **options,
    )


# --- characterization: A7 as it is ------------------------------------------


def test_today_a_time_only_trigger_waits_with_its_nearest_shot():
    shots, events = build(
        [trigger("t1", "2026-06-10T12:00:10Z")],
        [labfrog_row("a", "2026-06-10T12:00:00Z")],
    )
    status, shot_key, candidates = outcome(events, "t1")
    assert status == "ambiguous"
    assert shot_key == ""
    assert candidates == [shots[0]["shot_key"]]


def test_today_only_the_nearest_of_two_shots_in_the_tolerance_is_offered():
    shots, events = build(
        [trigger("t1", "2026-06-10T12:00:20Z")],
        [
            labfrog_row("a", "2026-06-10T12:00:00Z"),
            labfrog_row("bb", "2026-06-10T12:01:00Z"),
        ],
    )
    nearest = next(shot for shot in shots if shot["labfrog_record_id"] == "a")
    # The second shot, 40 s away and inside the tolerance, is not offered.
    assert outcome(events, "t1") == ("ambiguous", "", [nearest["shot_key"]])


def test_today_two_equally_near_shots_leave_the_event_unmatched():
    _shots, events = build(
        [trigger("t1", "2026-06-10T12:00:30Z")],
        [
            labfrog_row("a", "2026-06-10T12:00:00Z"),
            labfrog_row("bb", "2026-06-10T12:01:00Z"),
        ],
    )
    # A tie offers nothing: the event is unmatched, with no candidate.
    assert outcome(events, "t1") == ("unmatched", "", [])


def test_today_a_trigger_beyond_the_tolerance_is_unmatched():
    _shots, events = build(
        [trigger("t1", "2026-06-10T12:10:00Z")],
        [labfrog_row("a", "2026-06-10T12:00:00Z")],
    )
    assert outcome(events, "t1") == ("unmatched", "", [])


def test_today_an_unnumbered_event_without_labfrog_is_unmatched():
    shots, events = build([trigger("t1", "2026-06-10T12:00:10Z")], [])
    assert shots == []
    assert outcome(events, "t1")[0] == "unmatched"


def test_today_the_number_attaches_on_its_own():
    _shots, events = build(
        [trigger("t1", "2026-06-10T12:00:10Z", shot_number=5)],
        [labfrog_row("a", "2026-06-10T12:00:00Z", number=5)],
    )
    event = next(item for item in events if item["event_id"] == "t1")
    assert event["match_status"] == "matched"
    assert event["match_quality"] == "exact_day_shot_number"
