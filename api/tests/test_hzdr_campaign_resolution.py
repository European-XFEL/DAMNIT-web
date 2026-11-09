"""Campaign resolution (D1), the trigger/LabFrog union (W6.1) and bridge v4.

Covers the automatic shot assembly plan's DAMNIT side: ``unassigned`` events
are routed by LabFrog record -> campaign schedule -> reviewer ruling before the
per-campaign filter; trigger-only shots join the LabFrog records; the
time-based ranks can be switched to review-only; and the bridge gains the
``experiment_id_source`` shot column and the ``instrument_id`` event column.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, ClassVar, cast

import h5py
import pytest

from damnit_api.consumer.builder_trigger import BuilderTrigger
from damnit_api.consumer.spool import HZDRSpoolConsumer, SpoolConfig
from damnit_api.metadata.hzdr_event import (
    METADATA_KEY_REGISTRY,
    METADATA_KEY_VALUES,
    UNASSIGNED_EXPERIMENT_ID,
    HZDREventV1,
    lint_metadata_keys,
)
from damnit_api.metadata.hzdr_nexus import (
    HZDR_BRIDGE_PROFILE_VERSION,
    append_experiment_ruling,
    append_review_decision,
    load_campaign_schedule,
    load_experiment_rulings,
    load_review_decisions,
    normalize_processed_trigger_message,
    reconcile_canonical_shots,
    review_sidecar_path,
    write_nexus_bridge,
)
from damnit_api.shared.hzdr_settings import HZDRBuilderSettings

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "hzdr-hdf5-builder.py"
_SPEC = importlib.util.spec_from_file_location(
    "hzdr_hdf5_builder_resolution", SCRIPT_PATH
)
assert _SPEC is not None
assert _SPEC.loader is not None
builder = importlib.util.module_from_spec(_SPEC)
sys.modules["hzdr_hdf5_builder_resolution"] = builder
_SPEC.loader.exec_module(builder)

CAMPAIGN = "HELPMI"
OTHER = "TOFBeamline"
SOURCE_KEY = "hzdr-helpmi"


def trigger(
    shot_number: int | None,
    *,
    experiment_id: str = CAMPAIGN,
    timestamp: str = "2026-06-10T12:00:00Z",
    event_id: str | None = None,
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "schema_version": "hzdr-event-v1",
        "event_id": event_id or f"trigger-{shot_number}-{experiment_id}",
        "experiment_id": experiment_id,
        "shot_id": f"shot-{shot_number:06d}" if shot_number is not None else "x",
        "source": "DRACO-Trigger",
        "kind": "draco.trigger",
        "timestamp": timestamp,
        "transport": "kafka",
        "payload_ref": {"topic": "Draco01", "partition": 0, "offset": shot_number},
        "metadata": {},
    }
    if shot_number is not None:
        event["shot_number"] = shot_number
    return event


def watchdog(
    shot_number: int,
    *,
    experiment_id: str = CAMPAIGN,
    timestamp: str = "2026-06-10T12:00:05Z",
    instrument_id: str | None = None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    if instrument_id is not None:
        metadata["instrument"] = {"id": instrument_id, "group": "ions"}
    return {
        "event_id": f"watchdog-{shot_number}-{instrument_id}",
        "experiment_id": experiment_id,
        "shot_id": f"shot-{shot_number:06d}",
        "shot_number": shot_number,
        "source": "DAQ-File-Watchdog",
        "kind": "watchdog.file",
        "timestamp": timestamp,
        "transport": "kafka",
        "payload_ref": {"path": f"/data/{shot_number}.csv"},
        "metadata": metadata,
    }


def labfrog_record(
    shot_number: int,
    *,
    experiment_id: str | None = None,
    claimed: bool = True,
    shot_date: str = "2026-06-10",
) -> dict:
    """A LabFrog row; ``claimed`` rows carry the authority's number (schema 13).

    A row typed by hand (``claimed=False``) has no ``authority_shot_number``
    and is never number-matched (ruling R3).
    """
    record: dict[str, Any] = {
        "record_index": shot_number,
        "record_id": f"mongo-{shot_number}-{shot_date}",
        "shot_number": shot_number,
        "shot_date": shot_date,
        "labfrog_date_time": f"{shot_date}T12:00:00Z",
        "campaign": CAMPAIGN,
        "metadata": {},
    }
    if claimed:
        record["authority_shot_number"] = shot_number
    if experiment_id is not None:
        record["experiment_id"] = experiment_id
    return record


def schedule_file(tmp_path: Path, campaigns: list[dict[str, Any]], **extra) -> Path:
    document = {
        "schema": "labfrog-campaign-schedule-v1",
        "timezone": "Europe/Berlin",
        "window_rule": "[start 00:00, end+1 00:00) local time in `timezone`",
        "campaigns": campaigns,
        "warnings": [],
        **extra,
    }
    path = tmp_path / "schedule.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


def by_number(shots: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    return {shot["shot_number"]: shot for shot in shots}


# --- D2 registry -------------------------------------------------------------


class TestD2Registry:
    KEYS: ClassVar[dict[str, str | None]] = {
        "instrument.id": None,
        "instrument.group": None,
        "instrument.timing_role": None,
        "instrument.format": None,
        "instrument.record_source": None,
        "attribution.method": None,
        "attribution.status": None,
        "attribution.delta_s": "s",
        "attribution.candidates": None,
        "acquisition.time": None,
        "acquisition.time_source": None,
    }

    def test_keys_are_registered_with_their_units(self):
        for key, unit in self.KEYS.items():
            assert key in METADATA_KEY_REGISTRY, key
            assert METADATA_KEY_REGISTRY[key] == unit, key

    def test_every_enum_key_is_a_registry_key(self):
        assert set(METADATA_KEY_VALUES) <= set(METADATA_KEY_REGISTRY)

    def test_full_d2_metadata_is_lint_clean(self):
        metadata = {
            "instrument": {
                "id": "BAM",
                "group": "ions",
                "timing_role": "on_shot",
                "format": "camera_png_csv",
                "record_source": "catalogue+labfrog",
            },
            "attribution": {
                "method": "trigger_window",
                "status": "ambiguous",
                "delta_s": 0.42,
                "candidates": [41, 42],
            },
            "acquisition": {
                "time": "2026-06-10T12:00:00Z",
                "time_source": "first_seen",
            },
        }
        assert lint_metadata_keys(metadata) == []

    def test_off_vocabulary_enum_label_is_warned_not_rejected(self):
        warnings = lint_metadata_keys({"attribution": {"status": "guessed"}})
        assert len(warnings) == 1
        assert "attribution.status" in warnings[0]
        assert "guessed" in warnings[0]
        assert "metadata_json" in warnings[0]

    def test_enum_labels_match_case_insensitively(self):
        assert lint_metadata_keys({"instrument": {"group": "Electrons"}}) == []

    def test_unassigned_sentinel_is_a_valid_v1_envelope(self):
        event = trigger(42, experiment_id=UNASSIGNED_EXPERIMENT_ID)
        assert HZDREventV1.model_validate(event).experiment_id == "unassigned"
        described = HZDREventV1.model_json_schema()["properties"]["experiment_id"]
        assert "'unassigned'" in described["description"]


# --- W6.1 union --------------------------------------------------------------


def test_trigger_only_shot_joins_labfrog_records_in_one_union():
    shots, events = reconcile_canonical_shots(
        [trigger(17), trigger(99, timestamp="2026-06-10T15:00:00Z")],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
    )
    shots_by_number = by_number(shots)
    assert set(shots_by_number) == {17, 99}

    joined = shots_by_number[17]
    assert joined["labfrog_record_id"] == "mongo-17-2026-06-10"
    assert joined["match_status"] == "matched"
    assert joined["experiment_id_source"] == "labfrog"

    trigger_only = shots_by_number[99]
    assert trigger_only["labfrog_record_id"] is None
    assert trigger_only["labfrog_date_time"] is None
    assert trigger_only["match_status"] == "matched"
    assert trigger_only["experiment_id_source"] == "producer"
    assert trigger_only["fired_at"].startswith("2026-06-10T15:00:00")
    # No LabFrog row exists, so none is cited.
    assert [event["source"] for event in trigger_only["events"]] == ["DRACO-Trigger"]
    labfrog_events = [event for event in events if event["source"] == "LabFrog"]
    assert [event["shot_number"] for event in labfrog_events] == [17]


def test_watchdog_file_attaches_to_its_trigger_only_shot():
    shots, _ = reconcile_canonical_shots(
        [
            trigger(99, timestamp="2026-06-10T15:00:00Z"),
            watchdog(99, timestamp="2026-06-10T15:00:03Z", instrument_id="BAM"),
        ],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
    )
    shot = by_number(shots)[99]
    assert {event["source"] for event in shot["events"]} == {
        "DRACO-Trigger",
        "DAQ-File-Watchdog",
    }


def test_watchdog_attribution_candidates_become_review_choices():
    event = watchdog(99, timestamp="2026-06-10T15:00:03Z")
    event["metadata"]["attribution"] = {"status": "ambiguous", "candidates": [17]}
    shots, events = reconcile_canonical_shots(
        [event],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
    )
    candidate = next(item for item in events if item["source"] == "DAQ-File-Watchdog")
    assert candidate["match_status"] == "ambiguous"
    assert candidate["candidate_shot_keys"] == [shots[0]["shot_key"]]
    assert not any(item["source"] == "DAQ-File-Watchdog" for item in shots[0]["events"])


def test_labfrog_record_and_trigger_join_on_shot_number():
    shots, events = reconcile_canonical_shots(
        [trigger(17, timestamp="2026-06-10T12:00:02Z")],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17), labfrog_record(18)],
    )
    assert len(shots) == 2
    shot = by_number(shots)[17]
    assert shot["match_quality"] == "exact_day_shot_number"
    trigger_event = next(e for e in events if e["source"] == "DRACO-Trigger")
    assert trigger_event["shot_key"] == shot["shot_key"]


def test_authority_number_joins_even_when_operator_number_differs():
    record = labfrog_record(5)
    record["authority_shot_number"] = 701
    shots, events = reconcile_canonical_shots(
        [trigger(701)],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[record],
    )
    assert len(shots) == 1
    assert shots[0]["shot_number"] == 5
    assert shots[0]["authority_shot_number"] == 701
    trigger_event = next(e for e in events if e["source"] == "DRACO-Trigger")
    assert trigger_event["shot_key"] == shots[0]["shot_key"]
    assert trigger_event["match_status"] == "matched"


def test_typed_number_never_absorbs_authoritative_trigger():
    shots, events = reconcile_canonical_shots(
        [trigger(17)],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17, claimed=False)],
    )
    assert len(shots) == 1  # a duplicate trigger-only key is not invented
    assert shots[0]["match_status"] == "labfrog-only"
    assert "authority_shot_number" not in shots[0]
    trigger_event = next(e for e in events if e["source"] == "DRACO-Trigger")
    assert trigger_event["shot_key"] == ""
    assert trigger_event["match_status"] != "matched"


def test_time_ranks_only_propose_by_default():
    # A watchdog event with no shot number of its own lands within tolerance of
    # LabFrog shot 17: the pre-A7 ladder (opted into) attaches it by nearest
    # time; the default since ruling A7 only proposes it.
    stray = watchdog(0, timestamp="2026-06-10T12:00:30Z")
    stray.pop("shot_number")
    stray["shot_id"] = "unnumbered"

    _, legacy_events = reconcile_canonical_shots(
        [dict(stray)],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
        time_match_autoassign=True,
    )
    assert legacy_events[0]["match_quality"] == "nearest_time"

    shots, events = reconcile_canonical_shots(
        [dict(stray)],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
    )
    assert events[0]["match_status"] == "ambiguous"
    assert events[0]["shot_key"] == ""
    assert events[0]["candidate_shot_keys"] == [shots[0]["shot_key"]]
    assert shots[0]["match_status"] == "labfrog-only"


def test_a_numbered_trigger_is_never_pulled_onto_another_shot():
    # Ruling A7. Trigger 99 has no LabFrog record but fires 10 s after LabFrog
    # shot 17. The pre-A7 ladder (opted into) attached it to 17 by nearest time,
    # merging two shots; by default it founds its own trigger-only shot.
    near = trigger(99, timestamp="2026-06-10T12:00:10Z")
    legacy_shots, _ = reconcile_canonical_shots(
        [dict(near)],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
        time_match_autoassign=True,
    )
    assert set(by_number(legacy_shots)) == {17}

    shots, events = reconcile_canonical_shots(
        [dict(near)],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
    )
    assert set(by_number(shots)) == {17, 99}
    trigger_event = next(e for e in events if e["source"] == "DRACO-Trigger")
    assert trigger_event["shot_key"] == by_number(shots)[99]["shot_key"]
    assert trigger_event["candidate_shot_keys"] == []


def test_a_unique_number_attaches_on_the_number_alone_across_days():
    # W6.2: LabFrog's shot 17 is dated the day before the trigger (a record
    # entered late, or a shot just after midnight). Far outside the time
    # tolerance, the unique number is still the identity.
    late = trigger(17, timestamp="2026-06-11T09:00:00Z")
    shots, events = reconcile_canonical_shots(
        [late],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
    )
    assert set(by_number(shots)) == {17}
    trigger_event = next(e for e in events if e["source"] == "DRACO-Trigger")
    assert trigger_event["match_quality"] == "shot_number"
    assert trigger_event["match_status"] == "matched"
    assert by_number(shots)[17]["labfrog_record_id"] == "mongo-17-2026-06-10"


def test_a_number_held_by_two_shots_is_only_proposed():
    # Per-day numbering (or a rebase) gives two shots number 17 on different
    # days; the number is no longer an identity, so nothing attaches by time.
    other_day = labfrog_record(17)
    other_day.update(
        record_index=117,
        record_id="mongo-17b",
        shot_date="2026-06-09",
        labfrog_date_time="2026-06-09T12:00:00Z",
    )
    _, events = reconcile_canonical_shots(
        [trigger(17, timestamp="2026-06-11T12:00:00Z")],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17), other_day],
    )
    trigger_event = next(e for e in events if e["source"] == "DRACO-Trigger")
    assert trigger_event["match_status"] != "matched"


def test_numbered_triggers_near_another_labfrog_shot_stay_their_own_shots():
    # The Test Baseline 1.1 case that surfaced A7: triggers 1 and 3, each with
    # an authoritative number, 10 s either side of LabFrog shot 2.
    events = [
        trigger(1, timestamp="2026-06-10T12:00:00Z"),
        trigger(2, timestamp="2026-06-10T12:00:10Z"),
        trigger(3, timestamp="2026-06-10T12:00:20Z"),
    ]
    shots, _ = reconcile_canonical_shots(
        events,
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(2)],
    )
    shots_by_number = by_number(shots)
    assert set(shots_by_number) == {1, 2, 3}
    assert shots_by_number[2]["labfrog_record_id"] == "mongo-2-2026-06-10"
    assert shots_by_number[1]["labfrog_record_id"] is None
    assert shots_by_number[3]["labfrog_record_id"] is None


def test_include_trigger_only_false_keeps_the_labfrog_axis():
    shots, events = reconcile_canonical_shots(
        [trigger(99, timestamp="2026-06-10T15:00:00Z")],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
        include_trigger_only=False,
    )
    assert set(by_number(shots)) == {17}
    trigger_event = next(e for e in events if e["source"] == "DRACO-Trigger")
    assert trigger_event["match_status"] == "unmatched"


# --- D1 resolution chain -----------------------------------------------------


def test_unassigned_event_resolves_through_a_labfrog_record():
    shots, events = reconcile_canonical_shots(
        [trigger(17, experiment_id=UNASSIGNED_EXPERIMENT_ID)],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
    )
    trigger_event = next(e for e in events if e["source"] == "DRACO-Trigger")
    assert trigger_event["experiment_id"] == CAMPAIGN
    assert trigger_event["experiment_id_source"] == "labfrog"
    assert trigger_event["shot_key"] == shots[0]["shot_key"]


def test_a_sets_claimed_number_resolves_its_campaign_but_matches_no_row():
    """Schema v14: a set that claimed shots 501 and 502 has no v13 number,
    but its ``authority_shot_numbers`` name its campaign for each. The set row
    is not one shot, so the trigger becomes a shot of its own there."""
    set_row = labfrog_record(300, experiment_id=OTHER, claimed=False)
    set_row["authority_shot_numbers"] = [501, 502]
    shots, events = reconcile_canonical_shots(
        [trigger(502, experiment_id=UNASSIGNED_EXPERIMENT_ID)],
        experiment_id=OTHER,
        source_key=SOURCE_KEY,
        labfrog_shots=[set_row],
    )
    trigger_event = next(e for e in events if e["source"] == "DRACO-Trigger")
    assert trigger_event["experiment_id"] == OTHER
    assert trigger_event["experiment_id_source"] == "labfrog"
    assert trigger_event["shot_key"] != by_number(shots)[300]["shot_key"]
    assert 502 in by_number(shots)
    # The same number claimed in another campaign as well is no match.
    elsewhere = labfrog_record(502, experiment_id=CAMPAIGN)
    _, contested = reconcile_canonical_shots(
        [trigger(502, experiment_id=UNASSIGNED_EXPERIMENT_ID)],
        experiment_id=UNASSIGNED_EXPERIMENT_ID,
        source_key=SOURCE_KEY,
        labfrog_shots=[set_row, elsewhere],
    )
    assert (
        next(e for e in contested if e["source"] == "DRACO-Trigger")["experiment_id"]
        == UNASSIGNED_EXPERIMENT_ID
    )


def test_unassigned_event_resolves_through_the_campaign_schedule(tmp_path: Path):
    schedule = load_campaign_schedule(
        schedule_file(
            tmp_path,
            [
                {
                    "campaign": "HELPMI",
                    "experiment_id": CAMPAIGN,
                    "start": "2026-06-08",
                    "end": "2026-06-10",
                    "source": "mediawiki",
                },
                {
                    "campaign": "TOF+Beamline",
                    "experiment_id": OTHER,
                    "start": "2026-06-11",
                    "end": "2026-06-20",
                    "source": "mediawiki",
                },
            ],
        )
    )
    # 23:30 Berlin on the campaign's last (inclusive) day.
    late = trigger(
        5,
        experiment_id=UNASSIGNED_EXPERIMENT_ID,
        timestamp="2026-06-10T21:30:00Z",
    )
    shots, events = reconcile_canonical_shots(
        [late],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        campaign_schedule=schedule,
    )
    assert [shot["shot_number"] for shot in shots] == [5]
    assert shots[0]["experiment_id_source"] == "schedule"
    assert events[0]["experiment_id"] == CAMPAIGN

    # The same event is not the other campaign's...
    other, _ = reconcile_canonical_shots(
        [late],
        experiment_id=OTHER,
        source_key=SOURCE_KEY,
        campaign_schedule=schedule,
    )
    assert other == []
    # ...and 00:30 Berlin the next day already is.
    next_day = trigger(
        6,
        experiment_id=UNASSIGNED_EXPERIMENT_ID,
        timestamp="2026-06-10T22:30:00Z",
    )
    other, _ = reconcile_canonical_shots(
        [next_day],
        experiment_id=OTHER,
        source_key=SOURCE_KEY,
        campaign_schedule=schedule,
    )
    assert [shot["shot_number"] for shot in other] == [6]


def test_overlapping_windows_leave_the_shot_unassigned_but_built(tmp_path: Path):
    schedule = load_campaign_schedule(
        schedule_file(
            tmp_path,
            [
                {
                    "campaign": "A",
                    "experiment_id": CAMPAIGN,
                    "start": "2026-06-01",
                    "end": "2026-06-10",
                    "source": "mediawiki",
                },
                {
                    "campaign": "B",
                    "experiment_id": OTHER,
                    "start": "2026-06-10",
                    "end": "2026-06-20",
                    "source": "mediawiki",
                },
            ],
            warnings=[{"type": "overlap", "experiment_ids": [CAMPAIGN, OTHER]}],
        )
    )
    event = trigger(7, experiment_id=UNASSIGNED_EXPERIMENT_ID)
    for campaign in (CAMPAIGN, OTHER):
        shots, _ = reconcile_canonical_shots(
            [event],
            experiment_id=campaign,
            source_key=SOURCE_KEY,
            campaign_schedule=schedule,
        )
        assert shots == [], campaign

    bucket, events = reconcile_canonical_shots(
        [event],
        experiment_id=UNASSIGNED_EXPERIMENT_ID,
        source_key="hzdr-unassigned",
        campaign_schedule=schedule,
    )
    assert [shot["shot_number"] for shot in bucket] == [7]
    assert bucket[0]["experiment_id_source"] == "unassigned"
    assert bucket[0]["shot_key"].startswith("unassigned:")
    assert events[0]["experiment_id"] == UNASSIGNED_EXPERIMENT_ID


def test_unassigned_event_without_shot_number_is_never_routed(tmp_path: Path):
    schedule = load_campaign_schedule(
        schedule_file(
            tmp_path,
            [
                {
                    "campaign": "A",
                    "experiment_id": CAMPAIGN,
                    "start": "2026-06-01",
                    "end": "2026-06-30",
                    "source": "mediawiki",
                }
            ],
        )
    )
    event = trigger(None, experiment_id=UNASSIGNED_EXPERIMENT_ID)
    _, events = reconcile_canonical_shots(
        [event],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        campaign_schedule=schedule,
    )
    assert events == []


def test_producer_assigned_events_are_not_rerouted(tmp_path: Path):
    schedule = load_campaign_schedule(
        schedule_file(
            tmp_path,
            [
                {
                    "campaign": "B",
                    "experiment_id": OTHER,
                    "start": "2026-06-01",
                    "end": "2026-06-30",
                    "source": "mediawiki",
                }
            ],
        )
    )
    shots, _ = reconcile_canonical_shots(
        [trigger(8)],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        campaign_schedule=schedule,
    )
    assert shots[0]["experiment_id_source"] == "producer"


def test_ruling_assigns_an_otherwise_unassigned_shot(tmp_path: Path):
    sources_file = tmp_path / "hzdr_sources.json"
    append_review_decision(
        sources_file,
        source_key=SOURCE_KEY,
        event_id="evt-1",
        action="dismiss",
        by="op",
    )
    append_experiment_ruling(sources_file, shot_number=9, experiment_id=OTHER, by="op")
    append_experiment_ruling(
        sources_file,
        shot_number=9,
        experiment_id=CAMPAIGN,
        by="pi",
        review_level="VERIFIED",
    )
    append_experiment_ruling(sources_file, shot_number=9, experiment_id=OTHER, by="op")
    rulings = load_experiment_rulings([
        review_sidecar_path(sources_file),
        tmp_path / "missing.review.jsonl",
    ])
    assert rulings == {9: CAMPAIGN}  # VERIFIED outranks a later REVIEWED
    # Rulings and confirm/dismiss decisions share the file, not each other.
    assert set(load_review_decisions(sources_file, SOURCE_KEY)) == {"evt-1"}

    shots, _ = reconcile_canonical_shots(
        [trigger(9, experiment_id=UNASSIGNED_EXPERIMENT_ID)],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        experiment_rulings=rulings,
    )
    assert shots[0]["experiment_id_source"] == "ruling"


def test_ruling_must_name_a_campaign(tmp_path: Path):
    with pytest.raises(ValueError, match="real campaign"):
        append_experiment_ruling(
            tmp_path / "s.json",
            shot_number=1,
            experiment_id=UNASSIGNED_EXPERIMENT_ID,
            by="op",
        )


def test_schedule_loader_rejects_an_unknown_schema(tmp_path: Path):
    path = schedule_file(tmp_path, [], schema="labfrog-campaign-schedule-v2")
    with pytest.raises(ValueError, match="labfrog-campaign-schedule-v1"):
        load_campaign_schedule(path)


def test_schedule_rows_without_dates_never_match(tmp_path: Path):
    schedule = load_campaign_schedule(
        schedule_file(
            tmp_path,
            [
                {
                    "campaign": "ods",
                    "experiment_id": OTHER,
                    "start": None,
                    "end": None,
                    "source": "ods",
                },
                {
                    "campaign": "A",
                    "experiment_id": CAMPAIGN,
                    "start": "2026-06-01",
                    "end": "2026-06-02",
                    "source": "mediawiki",
                },
            ],
        )
    )
    assert [row["experiment_id"] for row in schedule] == [CAMPAIGN]


def test_trigger_normalizer_keeps_the_sentinel_under_an_override():
    envelope = trigger(3, experiment_id=UNASSIGNED_EXPERIMENT_ID)
    normalized = normalize_processed_trigger_message(envelope, experiment_id=CAMPAIGN)
    assert normalized["experiment_id"] == UNASSIGNED_EXPERIMENT_ID
    named = normalize_processed_trigger_message(trigger(3), experiment_id=OTHER)
    assert named["experiment_id"] == OTHER


def test_builder_does_not_count_the_sentinel_as_a_campaign():
    events = [trigger(1), trigger(2, experiment_id=UNASSIGNED_EXPERIMENT_ID)]
    assert builder.select_experiment_id(None, events, [], None) == CAMPAIGN
    only_unassigned = [trigger(2, experiment_id=UNASSIGNED_EXPERIMENT_ID)]
    assert (
        builder.select_experiment_id(None, only_unassigned, [], None)
        == UNASSIGNED_EXPERIMENT_ID
    )


# --- bridge profile v6 -------------------------------------------------------


def test_bridge_v6_writes_the_shot_authoritys_number(tmp_path: Path):
    """/entry/shots/authority_shot_number: the export's number for a LabFrog
    row, the events' number for a trigger-only shot, -1 for a typed row."""
    typed = labfrog_record(18, claimed=False)
    claimed = labfrog_record(17)
    claimed["authority_shot_number"] = 501  # LabFrog typed 17; the authority said 501
    shots, events = reconcile_canonical_shots(
        [trigger(99, timestamp="2026-06-10T15:00:00Z")],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[claimed, typed],
    )
    output = tmp_path / "canonical.nxs"
    write_nexus_bridge(
        output_path=output, experiment_id=CAMPAIGN, shots=shots, events=events
    )
    with h5py.File(output, "r") as handle:
        group = cast("h5py.Group", handle["entry/shots"])
        assert group.attrs["damnit_bridge_profile"] == "hzdr-canonical-shot-v6"
        column = cast("h5py.Dataset", group["authority_shot_number"])
        assert column.dtype.kind == "i"
        assert column.attrs["missing_value"] == -1
        numbers = dict(
            zip(
                cast("h5py.Dataset", group["shot_number"])[...].tolist(),
                column[...].tolist(),
                strict=True,
            )
        )
    assert numbers == {17: 501, 18: -1, 99: 99}


# --- bridge profile v4 -------------------------------------------------------


def test_bridge_v4_writes_experiment_id_source_and_instrument_id(tmp_path: Path):
    shots, events = reconcile_canonical_shots(
        [
            trigger(17),
            watchdog(17, instrument_id="BAM"),
            trigger(99, timestamp="2026-06-10T15:00:00Z"),
        ],
        experiment_id=CAMPAIGN,
        source_key=SOURCE_KEY,
        labfrog_shots=[labfrog_record(17)],
    )
    output = tmp_path / "canonical.nxs"
    write_nexus_bridge(
        output_path=output, experiment_id=CAMPAIGN, shots=shots, events=events
    )
    assert HZDR_BRIDGE_PROFILE_VERSION == "hzdr-canonical-shot-v6"
    with h5py.File(output, "r") as handle:
        assert handle.attrs["damnit_bridge_profile"] == "hzdr-canonical-shot-v6"
        shot_numbers = list(cast("h5py.Dataset", handle["entry/shots/shot_number"]))
        sources = cast(
            "h5py.Dataset", handle["entry/shots/experiment_id_source"]
        ).asstr()[...]
        assert dict(zip(shot_numbers, sources, strict=True)) == {
            17: "labfrog",
            99: "producer",
        }
        record_ids = cast("h5py.Dataset", handle["entry/shots/record_id"]).asstr()[...]
        assert dict(zip(shot_numbers, record_ids, strict=True))[99] == ""

        group = handle["entry/source_events"]
        event_sources = cast("h5py.Dataset", group["source"]).asstr()[...]
        instruments = cast("h5py.Dataset", group["instrument_id"]).asstr()[...]
        by_source = dict(zip(event_sources, instruments, strict=False))
        assert by_source["DAQ-File-Watchdog"] == "BAM"
        assert set(instruments) == {"BAM", ""}
        instrument = handle["entry/instrument/BAM"]
        assert instrument.attrs["NX_class"] == "NXcollection"
        assert instrument.attrs["event_table"] == "/entry/source_events"
        assert [event_sources[i] for i in instrument["event_index"]] == [
            "DAQ-File-Watchdog"
        ]


# --- spool + trigger ---------------------------------------------------------


class _Consumer(HZDRSpoolConsumer):
    async def _claim(self):  # pragma: no cover - not driven here
        return [], None

    async def _ack(self, token):  # pragma: no cover
        return None


def test_spool_routes_unassigned_events_to_the_shared_directory(tmp_path: Path):
    config = SpoolConfig(campaign=CAMPAIGN, consumer_group="g", spool_dir=tmp_path)
    consumer = _Consumer(config)
    unassigned = trigger(4, experiment_id=UNASSIGNED_EXPERIMENT_ID)

    assert consumer.consume_one(trigger(4)) == config.events_jsonl
    assert consumer.consume_one(unassigned) == tmp_path / "_unassigned" / "events.jsonl"
    assert config.unassigned_jsonl == tmp_path / "_unassigned" / "events.jsonl"

    # A restarted consumer still deduplicates against the shared file.
    restarted = _Consumer(config)
    assert restarted.consume_one(unassigned) is None


def test_builder_trigger_reads_unassigned_spools_once_they_exist(tmp_path: Path):
    unassigned_events = tmp_path / "_unassigned" / "events.jsonl"
    unassigned_triggers = tmp_path / "_unassigned" / "trigger.jsonl"
    settings = HZDRBuilderSettings(
        enabled=True,
        output_nexus=tmp_path / "c.nxs",
        campaign_schedule=tmp_path / "schedule.json",
        time_match_autoassign=False,
    )
    trigger_runner = BuilderTrigger(
        settings,
        events_jsonl=[tmp_path / "events.jsonl"],
        unassigned_events_jsonl=[unassigned_events],
        unassigned_trigger_jsonl=[unassigned_triggers],
    )
    command = trigger_runner.build_command()
    assert str(unassigned_events) not in command
    assert command[command.index("--campaign-schedule") + 1] == str(
        tmp_path / "schedule.json"
    )
    assert "--no-time-match-autoassign" in command

    unassigned_events.parent.mkdir(parents=True)
    unassigned_events.write_text("", encoding="utf-8")
    unassigned_triggers.write_text("", encoding="utf-8")
    command = trigger_runner.build_command()
    events_inputs = [
        command[i + 1] for i, arg in enumerate(command) if arg == "--events-jsonl"
    ]
    assert events_inputs == [str(tmp_path / "events.jsonl"), str(unassigned_events)]
    trigger_inputs = [
        command[i + 1] for i, arg in enumerate(command) if arg == "--trigger-jsonl"
    ]
    assert trigger_inputs == [str(unassigned_triggers)]


def test_builder_defaults_keep_time_matching_off(tmp_path: Path):
    # Ruling A7: off by default, and always passed explicitly, so the setting
    # governs whatever the script's own default is.
    settings = HZDRBuilderSettings(enabled=True, output_nexus=tmp_path / "c.nxs")
    assert settings.time_match_autoassign is False
    command = BuilderTrigger(settings).build_command()
    assert "--no-time-match-autoassign" in command
    assert "--time-match-autoassign" not in command
    opted_in = HZDRBuilderSettings(
        enabled=True, output_nexus=tmp_path / "c.nxs", time_match_autoassign=True
    )
    assert "--time-match-autoassign" in BuilderTrigger(opted_in).build_command()
    assert "--campaign-schedule" not in command
