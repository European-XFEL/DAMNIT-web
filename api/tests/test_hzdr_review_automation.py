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


# --- findings: every waiting event says why -----------------------------------


def reason(events, event_id):
    return next(item for item in events if item["event_id"] == event_id).get(
        "review_reason"
    )


def test_each_waiting_event_names_its_reason():
    rows = [
        labfrog_row("a", "2026-06-10T12:00:00Z"),
        labfrog_row("bb", "2026-06-10T12:01:00Z"),
        labfrog_row("ccc", "2026-06-10T13:00:00Z"),
        labfrog_row("dddd", "2026-06-10T14:00:00Z"),
    ]
    events = [
        trigger("far", "2026-06-10T15:00:00Z"),
        trigger("between", "2026-06-10T12:00:30Z"),
        trigger("pairable", "2026-06-10T13:00:05Z"),
        trigger("twin-1", "2026-06-10T14:00:05Z"),
        trigger("twin-2", "2026-06-10T14:00:40Z"),
        trigger("no-time", "not a time"),
    ]
    _shots, built = build([dict(event) for event in events], rows)
    assert reason(built, "far") == "no_shot_in_tolerance"
    assert reason(built, "between") == "several_shots_in_tolerance"
    assert reason(built, "pairable") == "time_rule_off"
    assert reason(built, "twin-1") == "shot_has_other_event"
    assert reason(built, "twin-2") == "shot_has_other_event"
    assert reason(built, "no-time") == "no_time"

    # With the rule on, the pairable one attaches and has no reason.
    _shots, built = one_to_one([dict(event) for event in events], rows)
    assert outcome(built, "pairable")[0] == "matched"
    assert reason(built, "pairable") is None


def test_reasons_for_attribution_numbers_and_no_labfrog():
    attributed = camera_file("f1", "2026-06-10T12:00:10Z")
    attributed["metadata"]["attribution"] = {"candidates": [7]}
    _shots, built = build(
        [attributed],
        [
            labfrog_row("a", "2026-06-10T12:00:00Z", number=6),
            labfrog_row("bb", "2026-06-10T12:10:00Z", number=7),
        ],
    )
    assert reason(built, "f1") == "attribution_disagrees"

    _shots, built = build(
        [trigger("t9", "2026-06-10T12:00:10Z", shot_number=9)],
        [
            labfrog_row("a", "2026-06-10T11:00:00Z", number=9),
            labfrog_row("bb", "2026-06-10T12:00:00Z", number=9),
        ],
    )
    assert outcome(built, "t9")[0] == "ambiguous"
    assert reason(built, "t9") == "number_held_by_several"

    _shots, built = build([trigger("t1", "2026-06-10T12:00:10Z")], [])
    assert reason(built, "t1") == "no_labfrog_record"


def test_the_reason_reaches_the_catalog_review_record():
    from damnit_api.metadata.hzdr_nexus import _review_event_api_record

    _shots, built = build(
        [trigger("t1", "2026-06-10T15:00:00Z")],
        [labfrog_row("a", "2026-06-10T12:00:00Z")],
    )
    record = _review_event_api_record(next(e for e in built if e["event_id"] == "t1"))
    assert record["review_reason"] == "no_shot_in_tolerance"


# --- item 2: suggestions from evidence other than time -----------------------


def suggestion(events, event_id):
    event = next(item for item in events if item["event_id"] == event_id)
    return event.get("suggested_shot_key"), event.get("suggestion_reason")


def test_the_watchdog_attribution_suggests_its_shot():
    attributed = camera_file("f1", "2026-06-10T12:00:10Z")
    attributed["metadata"]["attribution"] = {"candidates": [7]}
    shots, built = build(
        [attributed],
        [
            labfrog_row("a", "2026-06-10T12:00:00Z", number=6),
            labfrog_row("bb", "2026-06-10T12:10:00Z", number=7),
        ],
    )
    shot_7 = next(shot for shot in shots if shot["labfrog_record_id"] == "bb")
    assert outcome(built, "f1")[0] == "ambiguous"
    assert suggestion(built, "f1") == (shot_7["shot_key"], "watchdog_attribution")


def test_the_only_shot_without_that_instrument_is_suggested():
    rows = [
        labfrog_row("a", "2026-06-09T12:00:00Z", number=9),
        labfrog_row("bb", "2026-06-10T12:00:00Z", number=9),
    ]
    rows[0]["shot_date"] = "2026-06-09"
    # cam_a's file of 2026-06-09 sits on shot "a" by its day and number.
    held = camera_file("f-held", "2026-06-09T12:00:05Z")
    held["shot_number"] = 9
    # A cam_a file numbered 9 from another day fits both shots by number.
    waiting = camera_file("f2", "2026-06-11T12:00:00Z")
    waiting["shot_number"] = 9
    shots, built = build([held, waiting], rows)
    key_a = next(shot["shot_key"] for shot in shots if shot["labfrog_record_id"] == "a")
    key_b = next(
        shot["shot_key"] for shot in shots if shot["labfrog_record_id"] == "bb"
    )
    assert key_a != key_b
    assert outcome(built, "f-held")[:2] == ("matched", key_a)
    assert outcome(built, "f2") == ("ambiguous", "", [key_a, key_b])
    assert suggestion(built, "f2") == (key_b, "instrument_free")


def test_disagreeing_evidence_suggests_nothing():
    from damnit_api.metadata.hzdr_nexus import _set_suggestions

    shots = [
        {"shot_key": "s6", "authority_shot_number": 6, "metadata": {}},
        {"shot_key": "s7", "authority_shot_number": 7, "metadata": {}},
    ]
    held = camera_file("f-held", "2026-06-10T12:00:00Z")
    held["shot_key"] = "s7"
    event = camera_file("f1", "2026-06-10T12:00:10Z")
    event["metadata"]["attribution"] = {"candidates": [7]}
    event.update(match_status="ambiguous", candidate_shot_keys=["s6", "s7"])
    _set_suggestions([held, event], shots)
    # The watchdog names s7, but s7 already has cam_a's file: no suggestion.
    assert "suggested_shot_key" not in event


# --- item 3: a campaign for an unassigned shot --------------------------------


def test_review_suggests_the_campaign_both_neighbours_are_in(tmp_path, monkeypatch):
    import orjson
    from fastapi.testclient import TestClient

    from damnit_api.main import create_app
    from damnit_api.shared.settings import AuthSettings, settings

    def shot(source_key, number, time, how="labfrog"):
        return {
            "source_key": source_key,
            "shot_number": number,
            "shot_date": "2026-05-05",
            "fired_at": time,
            "shot_key": f"{source_key}:20260505:{number:06d}",
            "experiment_id_source": how,
            "events": [],
            "metadata": {},
        }

    def source(key, shots):
        return {
            "key": key,
            "title": key,
            "damnit_path": "",
            "metadata": {"experiment_id": key},
            "shots": shots,
            "review_events": [],
        }

    unassigned = [
        shot("unassigned", 1, "2026-05-05T10:05:00Z", "unassigned"),  # Pilot both sides
        shot("unassigned", 2, "2026-05-05T10:25:00Z", "unassigned"),  # Pilot | Other
        shot("unassigned", 3, "2026-05-05T12:00:00Z", "unassigned"),  # nothing after
    ]
    catalog = {
        "sources": [
            source(
                "Pilot_2026",
                [
                    shot("Pilot_2026", 1, "2026-05-05 12:00:00"),  # naive: Berlin
                    shot("Pilot_2026", 2, "2026-05-05T10:10:00Z"),
                ],
            ),
            source("Other_2026", [shot("Other_2026", 1, "2026-05-05T10:30:00Z")]),
            source("unassigned", unassigned),
        ]
    }
    sources_file = tmp_path / "hzdr_sources.json"
    sources_file.write_bytes(orjson.dumps(catalog))
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings.hzdr_builder, "campaign_timezone", "Europe/Berlin")
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="disabled"))

    with TestClient(create_app()) as client:
        body = client.get("/metadata/hzdr/sources/unassigned/review").json()
        pilot = client.get("/metadata/hzdr/sources/Pilot_2026/review").json()

    assert body["campaign_suggestions"] == {
        "unassigned:20260505:000001": {
            "experiment_id": "Pilot_2026",
            "before_shot_key": "Pilot_2026:20260505:000001",
            "after_shot_key": "Pilot_2026:20260505:000002",
        }
    }
    assert pilot["campaign_suggestions"] == {}


# --- item 4: kinds that are never a shot ----------------------------------------


def test_never_shot_kinds_are_acknowledged_by_rule_in_the_catalog(tmp_path):
    import orjson

    from damnit_api.metadata.hzdr_nexus import NEVER_SHOT_RULE, write_sources_catalog

    shots, built = build(
        [
            trigger("test-fire", "2026-06-10T15:00:00Z", kind="draco.test_fire"),
            trigger("real", "2026-06-10T15:30:00Z"),
            trigger("near", "2026-06-10T12:00:10Z", kind="draco.test_fire"),
        ],
        [labfrog_row("a", "2026-06-10T12:00:00Z")],
    )
    sources_file = tmp_path / "hzdr_sources.json"
    write_sources_catalog(
        sources_file=sources_file,
        source_key="hzdr-labfrog",
        experiment_id=EXPERIMENT,
        nexus_path=tmp_path / "c.nxs",
        shots=shots,
        events=built,
        never_shot_kinds=["draco.test_fire"],
    )
    source = orjson.loads(sources_file.read_bytes())["sources"][0]
    by_id = {event["event_id"]: event for event in source["review_events"]}
    assert by_id["test-fire"]["acknowledged"] is True
    assert by_id["test-fire"]["acknowledged_by"] == NEVER_SHOT_RULE
    assert "draco.test_fire" in by_id["test-fire"]["acknowledged_note"]
    # Another kind, and an ambiguous event of the listed kind, stay open.
    assert not by_id["real"].get("acknowledged")
    assert by_id["near"]["match_status"] == "ambiguous"
    assert not by_id["near"].get("acknowledged")
    assert source["match_summary"]["unmatched"] == 1


def test_a_persons_decision_stands_over_the_rule():
    from damnit_api.metadata.hzdr_nexus import _acknowledge_never_shot_kinds

    decided = {
        "event_id": "e1",
        "kind": "draco.test_fire",
        "match_status": "unmatched",
        "acknowledged": True,
        "acknowledged_by": "kim",
    }
    [kept] = _acknowledge_never_shot_kinds([decided], ["draco.test_fire"])
    assert kept["acknowledged_by"] == "kim"
    assert _acknowledge_never_shot_kinds([decided], []) == [decided]


def test_the_trigger_passes_never_shot_kinds(tmp_path):
    from damnit_api.consumer.builder_trigger import BuilderTrigger
    from damnit_api.shared.hzdr_settings import HZDRBuilderSettings

    settings = HZDRBuilderSettings(
        enabled=True,
        output_nexus=tmp_path / "c.nxs",
        never_shot_kinds=["draco.test_fire", "heartbeat"],
    )
    command = BuilderTrigger(settings, trigger_jsonl=[]).build_command()
    joined = " ".join(command)
    assert "--never-shot-kind draco.test_fire --never-shot-kind heartbeat" in joined
