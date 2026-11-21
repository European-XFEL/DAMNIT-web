"""Review matches made more automatic (hzdr/docs/plans/plan-review-automation.md).

The first group pins what the matcher does today with time-only events
(characterization, before the one-to-one rule): every later change in this
plan shows here as a moved outcome.
"""

from typing import Any

import pytest

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


# --- item 5: shot-aligner's one-to-one time rule ------------------------------


def one_to_one(events, rows, **options):
    return build(events, rows, time_match_one_to_one=True, **options)


def camera_file(event_id: str, time: str, instrument: str = "cam_a"):
    return trigger(
        event_id,
        time,
        source="DAQ-File-Watchdog",
        kind="daq.file",
        metadata={"instrument": {"id": instrument}},
    )


def test_one_to_one_attaches_an_unnumbered_trigger_to_its_only_shot():
    shots, events = one_to_one(
        [trigger("t1", "2026-06-10T12:00:10Z")],
        [labfrog_row("a", "2026-06-10T12:00:00Z")],
    )
    event = next(item for item in events if item["event_id"] == "t1")
    assert event["match_status"] == "matched"
    assert event["match_quality"] == "time_one_to_one"
    assert event["shot_key"] == shots[0]["shot_key"]
    assert event["match_time_delta_s"] == pytest.approx(-10.0)
    assert shots[0]["match_status"] == "matched"
    assert "t1" in {item["event_id"] for item in shots[0]["events"]}


def test_one_to_one_reads_naive_labfrog_times_in_the_campaign_zone():
    _shots, events = one_to_one(
        [trigger("t1", "2026-06-10T10:00:10Z")],
        [labfrog_row("a", "2026-06-10T12:00:00")],  # Berlin, UTC+2
        campaign_timezone="Europe/Berlin",
    )
    assert outcome(events, "t1")[0] == "matched"


def test_one_to_one_leaves_two_shots_in_the_tolerance_to_a_person():
    _shots, events = one_to_one(
        [trigger("t1", "2026-06-10T12:00:20Z")],
        [
            labfrog_row("a", "2026-06-10T12:00:00Z"),
            labfrog_row("bb", "2026-06-10T12:01:00Z"),
        ],
    )
    assert outcome(events, "t1")[0] == "ambiguous"


def test_one_to_one_leaves_two_events_of_one_stream_to_a_person():
    _shots, events = one_to_one(
        [trigger("t1", "2026-06-10T12:00:10Z"), trigger("t2", "2026-06-10T12:00:50Z")],
        [labfrog_row("a", "2026-06-10T12:00:00Z")],
    )
    assert outcome(events, "t1")[0] != "matched"
    assert outcome(events, "t2")[0] != "matched"


def test_one_to_one_pairs_each_stream_on_its_own():
    shots, events = one_to_one(
        [
            trigger("t1", "2026-06-10T12:00:10Z"),
            camera_file("f1", "2026-06-10T12:00:20Z", "cam_a"),
            camera_file("f2", "2026-06-10T12:00:25Z", "cam_b"),
        ],
        [labfrog_row("a", "2026-06-10T12:00:00Z")],
    )
    key = shots[0]["shot_key"]
    for event_id in ("t1", "f1", "f2"):
        assert outcome(events, event_id)[:2] == ("matched", key)


def test_one_to_one_never_gives_a_shot_a_second_event_of_a_stream():
    # Shot 5's trigger is matched by its number; a second, unnumbered
    # trigger near the same shot does not join it by time.
    _shots, events = one_to_one(
        [
            trigger("t5", "2026-06-10T11:58:30Z", shot_number=5),
            trigger("t-extra", "2026-06-10T12:00:10Z"),
        ],
        [labfrog_row("a", "2026-06-10T12:00:00Z", number=5)],
    )
    assert outcome(events, "t5")[0] == "matched"
    assert outcome(events, "t-extra")[0] != "matched"


def test_one_to_one_never_pairs_a_numbered_trigger_by_time():
    # A7's original case: a number LabFrog lacks founds its own shot.
    shots, events = one_to_one(
        [trigger("t3", "2026-06-10T12:00:10Z", shot_number=3)],
        [labfrog_row("a", "2026-06-10T12:00:00Z", number=2)],
    )
    event = next(item for item in events if item["event_id"] == "t3")
    assert event["match_quality"] != "time_one_to_one"
    assert any(
        shot.get("authority_shot_number") == 3 or shot["shot_number"] == 3
        for shot in shots
    )


def test_one_to_one_respects_a_watchdog_attribution_naming_another_shot():
    attributed = camera_file("f1", "2026-06-10T12:00:10Z")
    attributed["metadata"]["attribution"] = {"candidates": [7]}
    _shots, events = one_to_one(
        [attributed],
        [
            labfrog_row("a", "2026-06-10T12:00:00Z", number=6),
            labfrog_row("bb", "2026-06-10T12:10:00Z", number=7),
        ],
    )
    assert outcome(events, "f1")[0] != "matched"


def test_one_to_one_does_not_depend_on_event_order():
    events = [
        trigger("t1", "2026-06-10T12:00:10Z"),
        trigger("t2", "2026-06-10T12:05:00Z"),
        camera_file("f1", "2026-06-10T12:05:20Z"),
    ]
    rows = [
        labfrog_row("a", "2026-06-10T12:00:00Z"),
        labfrog_row("bb", "2026-06-10T12:05:10Z"),
    ]

    def outcomes(order):
        _shots, built = one_to_one([dict(event) for event in order], rows)
        return {
            item["event_id"]: outcome(built, item["event_id"])[:2]
            for item in built
            if item["event_id"] in {"t1", "t2", "f1"}
        }

    assert outcomes(events) == outcomes(list(reversed(events)))
    assert all(status == "matched" for status, _key in outcomes(events).values())


def test_time_match_autoassign_still_restores_the_old_ladder():
    _shots, events = build(
        [trigger("t1", "2026-06-10T12:00:10Z")],
        [labfrog_row("a", "2026-06-10T12:00:00Z")],
        time_match_autoassign=True,
        time_match_one_to_one=True,
    )
    event = next(item for item in events if item["event_id"] == "t1")
    assert event["match_quality"] == "nearest_time"


def test_the_trigger_passes_the_setting_to_the_builder(tmp_path):
    from damnit_api.consumer.builder_trigger import BuilderTrigger
    from damnit_api.shared.hzdr_settings import HZDRBuilderSettings

    def command(**extra):
        settings = HZDRBuilderSettings(
            enabled=True, output_nexus=tmp_path / "c.nxs", **extra
        )
        return BuilderTrigger(settings, trigger_jsonl=[]).build_command()

    assert "--no-time-match-one-to-one" in command()
    assert "--time-match-one-to-one" in command(time_match_one_to_one=True)
