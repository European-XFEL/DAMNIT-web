"""Tests for the canonical HZDREventV1 contract shared across HZDR producers."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from damnit_api.metadata.hzdr_event import (
    EVENT_REQUIRED_FIELDS,
    MAX_VALUES_BYTES,
    MAX_VALUES_ITEMS,
    HZDREventV1,
    HZDRPayloadRef,
    check_values_size,
)
from damnit_api.metadata.hzdr_nexus import load_normalized_events
from damnit_api.metadata.hzdr_sources import HZDRReviewEvent, HZDRSourceEvent

EXPERIMENT_ID = "Solenoid_Beamline_Tests_01.2025"

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _canonical_schema_text() -> str:
    """Deterministic JSON text of the model's JSON schema (matches the fixture)."""
    return json.dumps(HZDREventV1.model_json_schema(), indent=2, sort_keys=True) + "\n"


def test_model_json_schema_matches_committed_fixture():
    """Drift guard: the model and the committed hzdr-event-v1.schema.json agree.

    The same schema.json is vendored byte-identically into planet-watchdog and
    shotcounter, where parallel tests assert their own copy. If this fails after
    a model change, regenerate with
    ``api/scripts/regen_hzdr_event_fixtures.py`` and copy both fixtures into the
    sibling repos - that copy step is the one reviewable point where a contract
    change crosses repo boundaries.
    """
    committed = (FIXTURES_DIR / "hzdr-event-v1.schema.json").read_text(encoding="utf-8")
    assert _canonical_schema_text() == committed


def test_sample_fixture_validates_against_model():
    """The shared sample event round-trips through the canonical model."""
    sample = json.loads(
        (FIXTURES_DIR / "hzdr-event-v1.sample.json").read_text(encoding="utf-8")
    )

    event = HZDREventV1.model_validate(sample)

    assert event.schema_version == "hzdr-event-v1"


def _minimal_event(**overrides) -> dict:
    event = {
        "event_id": "evt-1",
        "experiment_id": EXPERIMENT_ID,
        "shot_id": "shot-000001",
        "shot_number": 1,
        "source": "PLANET-Watchdog",
        "kind": "watchdog.file",
        "timestamp": "2025-01-15T09:00:01Z",
        "transport": "kafka",
    }
    event.update(overrides)
    return event


def test_minimal_event_validates():
    event = HZDREventV1.model_validate(_minimal_event())

    assert event.schema_version == "hzdr-event-v1"
    assert event.shot_number == 1


def test_shot_number_null_validates_and_means_not_yet_authoritative():
    event = HZDREventV1.model_validate(_minimal_event(shot_number=None))

    assert event.shot_number is None


def test_values_none_validates():
    event = HZDREventV1.model_validate(_minimal_event(values=None))

    assert event.values is None


def test_small_structured_values_validates():
    event = HZDREventV1.model_validate(
        _minimal_event(values={"energy": 8.2, "ok": True})
    )

    assert event.values == {"energy": 8.2, "ok": True}


def test_small_array_values_validate_for_embedded_numeric_payloads():
    event = HZDREventV1.model_validate(_minimal_event(values=[1.0, 2.0, 3.0]))

    assert event.values == [1.0, 2.0, 3.0]


class TestValuesSizeGuard:
    """check_values_size keeps large payloads out of the inline `values` field."""

    def test_none_and_small_payloads_pass(self):
        assert check_values_size(None) is None
        assert check_values_size(8.2) is None
        assert check_values_size([1.0, 2.0, 3.0]) is None
        assert check_values_size({"energy": 8.2, "ok": True}) is None

    def test_too_many_items_is_rejected(self):
        error = check_values_size([0.0] * (MAX_VALUES_ITEMS + 1))

        assert error is not None
        assert "items" in error
        assert "payload_ref" in error

    def test_nested_arrays_are_counted_recursively(self):
        # An image-shaped array: outer length is tiny but total elements exceed
        # the item limit, so it must still be rejected.
        rows = MAX_VALUES_ITEMS // 4 + 1
        error = check_values_size([[0.0, 0.0, 0.0, 0.0] for _ in range(rows)])

        assert error is not None
        assert "items" in error

    def test_oversized_byte_payload_is_rejected(self):
        # Few items, but each a long string, so the JSON byte budget trips first.
        big_string = "x" * (MAX_VALUES_BYTES // 4)
        error = check_values_size([big_string, big_string, big_string, big_string])

        assert error is not None
        assert "bytes" in error
        assert "payload_ref" in error


def test_payload_ref_supports_kafka_traceability_fields():
    event = HZDREventV1.model_validate(
        _minimal_event(
            payload_ref={
                "topic": "planet-watchdog-events",
                "partition": 0,
                "offset": 17,
                "message_key": "shot-1",
            }
        )
    )

    assert event.payload_ref.topic == "planet-watchdog-events"
    assert event.payload_ref.partition == 0
    assert event.payload_ref.offset == 17


def test_payload_ref_allows_producer_specific_extra_keys():
    payload_ref = HZDRPayloadRef.model_validate({"run_id": "run-42"})

    assert payload_ref.run_id == "run-42"


def test_envelope_rejects_unknown_top_level_fields():
    with pytest.raises(ValidationError):
        HZDREventV1.model_validate(_minimal_event(made_up_field="nope"))


def test_json_schema_marks_shot_number_and_values_nullable():
    schema = HZDREventV1.model_json_schema()

    shot_number_schema = schema["properties"]["shot_number"]
    values_schema = schema["properties"]["values"]

    assert "anyOf" in shot_number_schema
    assert any(option.get("type") == "null" for option in shot_number_schema["anyOf"])
    assert "anyOf" in values_schema
    assert any(option.get("type") == "null" for option in values_schema["anyOf"])


class TestSharedContractDerivation:
    """hzdr_sources.py and hzdr_nexus.py must derive from HZDREventV1, not
    maintain independent field lists/event schemas."""

    def test_event_required_fields_derived_from_model_field_names(self):
        # Every key in EVENT_REQUIRED_FIELDS must be a real HZDREventV1 field
        # name - this is what "derived from" means structurally, even though
        # the set is intentionally narrower than the full model (see
        # hzdr_event.py for which fields a loaded file may omit and why).
        assert set(HZDREventV1.model_fields) >= EVENT_REQUIRED_FIELDS
        assert "payload_ref" in EVENT_REQUIRED_FIELDS

    def test_load_normalized_events_accepts_a_full_hzdr_event_v1_record(self, tmp_path):
        event = HZDREventV1.model_validate(_minimal_event()).model_dump(mode="json")
        path = tmp_path / "events.json"
        path.write_text(json.dumps(event), encoding="utf-8")

        loaded = load_normalized_events([path])

        assert loaded[0]["event_id"] == "evt-1"

    def test_hzdr_source_event_payload_ref_is_hzdr_payload_ref(self):
        source_event = HZDRSourceEvent.model_validate({
            "event_id": "evt-1",
            "source": "PLANET-Watchdog",
            "kind": "watchdog.file",
            "timestamp": "2025-01-15T09:00:01Z",
            "payload_ref": {"topic": "planet-watchdog-events", "offset": 1},
        })

        assert isinstance(source_event.payload_ref, HZDRPayloadRef)
        assert source_event.payload_ref.topic == "planet-watchdog-events"

    def test_hzdr_review_event_payload_ref_is_hzdr_payload_ref(self):
        review_event = HZDRReviewEvent.model_validate({
            "event_id": "evt-2",
            "experiment_id": EXPERIMENT_ID,
            "source": "PLANET-Watchdog",
            "kind": "watchdog.file",
            "timestamp": "2025-01-15T09:00:01Z",
            "payload_ref": {"path": "Z:/data/shot-1.csv"},
            "match_status": "unmatched",
        })

        assert isinstance(review_event.payload_ref, HZDRPayloadRef)
        assert review_event.payload_ref.path == "Z:/data/shot-1.csv"
