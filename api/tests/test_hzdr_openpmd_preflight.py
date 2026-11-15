"""Phase-2 evidence for the multi-source openPMD projection contract.

Two things are under test and they are deliberately kept apart:

* the **canonical fixture** - three reconciled shots spanning shotcounter,
  LabFrog, two PLANET Watchdog PCs and ASAPO, plus one orphan event - built
  through the real reconciler and the real single-writer bridge builder, and
* the **preflight** - resolving a reviewed nexus-design-studio projection plan
  against that file and reporting what a projector could and could not do.

No openPMD file is written anywhere in this module; Phase 3 owns the writer.
See `hzdr/docs/plans/openpmd-projection-plan.md`.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, cast

import h5py
import numpy as np
import pytest

from damnit_api.metadata.hzdr_openpmd import (
    PREFLIGHT_REPORT_VERSION,
    ProjectionPlanError,
    load_projection_plan,
    preflight_projection,
)

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "hzdr-openpmd-fixture.py"
SPEC = importlib.util.spec_from_file_location("hzdr_openpmd_fixture", SCRIPT_PATH)
assert SPEC is not None
hzdr_openpmd_fixture = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["hzdr_openpmd_fixture"] = hzdr_openpmd_fixture
SPEC.loader.exec_module(hzdr_openpmd_fixture)


@pytest.fixture(scope="module")
def fixture_paths(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    """Build the canonical fixture once; every test here reads it read-only."""
    return hzdr_openpmd_fixture.build_fixture(tmp_path_factory.mktemp("openpmd"))


@pytest.fixture
def plan(fixture_paths: dict[str, Path]) -> dict[str, Any]:
    return load_projection_plan(fixture_paths["plan_file"])


def _column(handle: h5py.File, path: str) -> list[Any]:
    dataset = cast("h5py.Dataset", handle[path])
    if dataset.dtype.kind in {"S", "O", "U"}:
        return [str(value) for value in dataset.asstr()[...]]
    return [value.item() for value in dataset[...]]


def _rule(report: dict[str, Any], target_name: str) -> dict[str, Any]:
    matches = [rule for rule in report["rules"] if rule["target_name"] == target_name]
    assert len(matches) == 1, f"expected exactly one {target_name} rule"
    return matches[0]


def _codes(rule: dict[str, Any]) -> set[str]:
    return {issue["code"] for issue in rule["issues"]}


# --------------------------------------------------------------------------
# The canonical fixture
# --------------------------------------------------------------------------


def test_fixture_builds_three_shot_indexed_canonical_iterations(
    fixture_paths: dict[str, Path],
):
    with h5py.File(fixture_paths["canonical_nexus"], "r") as handle:
        assert _column(handle, "/entry/shots/shot_index") == [0, 1, 2]
        assert _column(handle, "/entry/shots/shot_number") == [101, 102, 103]
        shot_keys = _column(handle, "/entry/shots/shot_key")
        # The stable identity is shot_key; there is no `shot_id` column, which
        # is why the plan's iteration.shot_id_path points at shot_key.
        assert "shot_id" not in cast("h5py.Group", handle["/entry/shots"])
        assert len(set(shot_keys)) == 3
        assert all(key.endswith(("101", "102", "103")) for key in shot_keys)
        assert _column(handle, "/entry/shots/fired_at") == [
            "2026-08-31T12:00:00+00:00",
            "2026-08-31T12:01:00+00:00",
            "2026-08-31T12:02:00+00:00",
        ]


def test_two_watchdog_pcs_reporting_one_filename_do_not_collide(
    fixture_paths: dict[str, Path],
):
    """PC A and PC B publish the same `kind` and the same local file path."""
    with h5py.File(fixture_paths["canonical_nexus"], "r") as handle:
        payloads = cast("h5py.Group", handle["/entry/watchdog/beam_profiler"])
        assert set(payloads) == {
            "watchdog-pc-a-101",
            "watchdog-pc-b-102",
            "watchdog-pc-a-orphan",
        }
        pc_a = cast("h5py.Dataset", payloads["watchdog-pc-a-101/values"])
        pc_b = cast("h5py.Dataset", payloads["watchdog-pc-b-102/values"])
        assert list(pc_a[...]) == [12.5, 13.0, 12.8, 13.2]
        assert list(pc_b[...]) == [9.1, 9.4, 9.2, 9.6]

        paths = _column(handle, "/entry/data_products/path")
        product_ids = _column(handle, "/entry/data_products/product_id")
        shared = hzdr_openpmd_fixture.SHARED_WATCHDOG_FILE
        colliding = [
            product_id
            for product_id, path in zip(product_ids, paths, strict=True)
            if path == shared
        ]
        # Same file path on both PCs, still two distinct product rows.
        assert len(colliding) == len(set(colliding)) >= 2


def test_source_events_preserve_producer_transport_and_match_provenance(
    fixture_paths: dict[str, Path],
):
    with h5py.File(fixture_paths["canonical_nexus"], "r") as handle:
        event_ids = _column(handle, "/entry/source_events/event_id")
        payload_refs = _column(handle, "/entry/source_events/payload_ref_json")
        metadata_json = _column(handle, "/entry/source_events/metadata_json")
        transports = _column(handle, "/entry/source_events/source_ref")
        by_id = dict(zip(event_ids, range(len(event_ids)), strict=True))

    watchdog_a = json.loads(metadata_json[by_id["watchdog-pc-a-101"]])
    watchdog_b = json.loads(metadata_json[by_id["watchdog-pc-b-102"]])
    assert watchdog_a["producer"]["instance_id"] == "watchdog-pc-a"
    assert watchdog_b["producer"]["instance_id"] == "watchdog-pc-b"
    assert watchdog_a["parser"] == {"name": "beam-profiler", "version": "1.4.0"}

    trigger_ref = json.loads(payload_refs[by_id["trigger-101"]])
    assert (trigger_ref["topic"], trigger_ref["partition"], trigger_ref["offset"]) == (
        "hzdr.trigger",
        0,
        501,
    )
    assert json.loads(payload_refs[by_id["laserdata-101"]])["uri"] == (
        "asapo://hzdr/laserdata/101"
    )
    assert transports[by_id["laserdata-101"]] == "asapo"


def test_orphan_watchdog_event_stays_unmatched_and_visible(
    fixture_paths: dict[str, Path],
):
    with h5py.File(fixture_paths["canonical_nexus"], "r") as handle:
        event_ids = _column(handle, "/entry/source_events/event_id")
        shot_keys = _column(handle, "/entry/source_events/shot_key")
        statuses = _column(handle, "/entry/source_events/match_status")
        index = event_ids.index("watchdog-pc-a-orphan")

        assert shot_keys[index] == ""
        assert statuses[index] == "unmatched"
        # Present in the file, absent from every shot: never silently assigned.
        assert "/entry/watchdog/beam_profiler/watchdog-pc-a-orphan" in handle
        assert _column(handle, "/entry/shots/shot_index") == [0, 1, 2]


def test_missing_source_keeps_the_iteration_and_does_not_shift_alignment(
    fixture_paths: dict[str, Path],
):
    """Shot 103 has no ASAPO and no Watchdog event; shots 101/102 must not move."""
    with h5py.File(fixture_paths["canonical_nexus"], "r") as handle:
        series = "/entry/instrument/laser/shot_series/pulse_energy"
        pulse_energy = list(cast("h5py.Dataset", handle[series])[...])
        signal_mean = list(
            cast("h5py.Dataset", handle["/entry/instrument/detector_signal_mean/data"])[
                ...
            ]
        )
        charge = list(cast("h5py.Dataset", handle["/entry/derived/ict_charge"])[...])

    assert pulse_energy[0] == pytest.approx(8.2)
    assert np.isnan(pulse_energy[1])
    assert np.isnan(pulse_energy[2])
    assert signal_mean[0] == pytest.approx(12.875)
    assert signal_mean[1] == pytest.approx(9.325)
    assert np.isnan(signal_mean[2])
    assert charge == pytest.approx([1.24, 1.41, 1.08])


# --------------------------------------------------------------------------
# The preflight
# --------------------------------------------------------------------------


def test_preflight_resolves_the_reviewed_plan_against_the_fixture(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=plan
    )

    assert report["report_version"] == PREFLIGHT_REPORT_VERSION
    assert report["status"] == "pass"
    assert report["plan"]["openpmd_standard"] == "1.1.0"
    assert report["plan_issues"] == []
    assert report["iteration"]["shot_count"] == 3
    assert len(report["iteration"]["shot_ids"]) == 3
    assert report["iteration"]["issues"] == []
    assert report["counts"] == {"accepted": 6, "deferred": 1, "rejected": 0}
    # JSON-serializable by construction: this is release evidence, not a repr.
    json.dumps(report)


def test_preflight_carries_dtype_shape_and_units_for_accepted_rules(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=plan
    )

    charge = _rule(report, "ict_charge")
    assert charge["status"] == "accepted"
    assert charge["axis"] == "shot"
    assert charge["shape"] == [3]
    assert charge["units"] == "nC"
    assert charge["issues"] == []

    energy = _rule(report, "laser_pulse_energy")
    assert (energy["status"], energy["units"]) == ("accepted", "J")


def test_producer_instance_id_is_a_canonical_column(
    fixture_paths: dict[str, Path],
):
    """Bridge profile v3: per-PC identity has a path of its own.

    Before v3 `metadata.producer.instance_id` reached the canonical file only
    inside `/entry/source_events/metadata_json`, so no projection rule could
    name the emitting PC. The column is descriptive, not a join key: `event_id`
    stays the discriminator, and a producer that never sets it writes "".
    """
    with h5py.File(fixture_paths["canonical_nexus"], "r") as handle:
        event_ids = _column(handle, "/entry/source_events/event_id")
        instances = _column(handle, "/entry/source_events/producer_instance_id")
        by_id = dict(zip(event_ids, instances, strict=True))

    assert by_id["watchdog-pc-a-101"] == "watchdog-pc-a"
    assert by_id["watchdog-pc-b-102"] == "watchdog-pc-b"
    assert by_id["watchdog-pc-a-orphan"] == "watchdog-pc-a"
    assert by_id["laserdata-101"] == "asapo-laserdata-01"
    # shotcounter and the synthesized LabFrog row set no producer block.
    assert by_id["trigger-101"] == ""


def test_preflight_resolves_the_producer_instance_path(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """The rule that used to warn now carries its provenance cleanly."""
    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=plan
    )

    rule = _rule(report, "detector_signal_mean")
    assert rule["status"] == "accepted"
    assert "producer_instance_path_missing" not in _codes(rule)
    # The value is shot-indexed and the provenance is event-indexed, so the
    # join note stays - that is a real instruction to the projector, not a gap.
    assert _codes(rule) == {"provenance_axis_mismatch"}


def test_preflight_still_reports_a_genuinely_absent_provenance_path(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """The reason code must survive the v3 bump for producers that lack it."""
    broken = copy.deepcopy(plan)
    rule = next(
        r for r in broken["rules"] if r["target_name"] == "detector_signal_mean"
    )
    rule["producer_instance_path"] = "/entry/source_events/no_such_provenance"

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    assert "producer_instance_path_missing" in _codes(
        _rule(report, "detector_signal_mean")
    )


def test_required_rule_promotes_a_provenance_warning_to_a_rejection(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    strict = copy.deepcopy(plan)
    rule = next(
        r for r in strict["rules"] if r["target_name"] == "detector_signal_mean"
    )
    rule["required"] = True

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=strict
    )

    rejected = _rule(report, "detector_signal_mean")
    assert rejected["status"] == "rejected"
    assert report["status"] == "fail"


def test_preflight_flags_event_and_product_axes_as_joins_not_positions(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """`/entry/source_events` and `/entry/data_products` are not shot-indexed."""
    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=plan
    )

    product = _rule(report, "watchdog_product")
    assert product["axis"] == "product"
    assert product["join_column"] == "/entry/data_products/shot_key"
    assert "source_axis_joined" in _codes(product)

    payload = _rule(report, "laser_near_field")
    assert payload["axis"] == "event"
    assert payload["status"] == "deferred"
    assert "payload_resolution_deferred" in _codes(payload)


def test_preflight_rejects_an_absent_source_path(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    broken = copy.deepcopy(plan)
    broken["rules"] = [
        {
            "source": "labfrog",
            "source_path": "/entry/derived/does_not_exist",
            "role": "scalar_mesh",
            "target_name": "ghost",
            "component": "value",
            "materialization": "inline",
            "required": True,
        }
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    assert report["status"] == "fail"
    assert _codes(_rule(report, "ghost")) == {"source_path_missing"}


def test_preflight_rejects_a_non_numeric_scalar_mesh(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    broken = copy.deepcopy(plan)
    broken["rules"] = [
        {
            "source": "damnit",
            "source_path": "/entry/shots/match_status",
            "role": "scalar_mesh",
            "target_name": "match_status",
            "component": "value",
            "materialization": "inline",
        },
        # A resolvable companion, so this exercises the optional-rejection
        # policy rather than the separate "plan resolves to nothing" guard.
        {
            "source": "labfrog",
            "source_path": "/entry/derived/ict_charge",
            "role": "scalar_mesh",
            "target_name": "ict_charge",
            "component": "value",
            "materialization": "inline",
        },
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    rule = _rule(report, "match_status")
    assert rule["status"] == "rejected"
    assert "source_not_numeric" in _codes(rule)
    # Not required, so a rejected optional rule is reported without failing.
    assert report["status"] == "pass"


def test_preflight_rejects_an_event_indexed_scalar_mesh(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    broken = copy.deepcopy(plan)
    broken["rules"] = [
        {
            "source": "planet-watchdog",
            "source_path": "/entry/source_events/match_time_delta_s",
            "role": "scalar_mesh",
            "target_name": "event_delta",
            "component": "value",
            "materialization": "inline",
            "required": True,
        }
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    assert "source_axis_unaligned" in _codes(_rule(report, "event_delta"))
    assert report["status"] == "fail"


def test_preflight_refuses_an_unreviewed_openpmd_standard(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    future = copy.deepcopy(plan)
    future["openpmd_standard"] = "2.0.0"

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=future
    )

    assert report["status"] == "fail"
    assert [issue["code"] for issue in report["plan_issues"]] == [
        "plan_standard_unsupported"
    ]


def test_preflight_reports_duplicate_paths_and_destinations(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    duplicated = copy.deepcopy(plan)
    repeated = duplicated["rules"][2]
    duplicated["rules"] = [repeated, copy.deepcopy(repeated)]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=duplicated
    )

    codes = {issue["code"] for issue in report["plan_issues"]}
    assert {"duplicate_source_path", "duplicate_destination"} <= codes
    assert report["status"] == "fail"


def test_preflight_fails_a_plan_whose_iteration_index_is_absent(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    broken = copy.deepcopy(plan)
    broken["iteration"]["index_path"] = "/entry/shots/no_such_index"

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    assert report["status"] == "fail"
    assert "iteration_index_missing" in {
        issue["code"] for issue in report["iteration"]["issues"]
    }


def test_preflight_writes_nothing_to_the_canonical_file(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    nexus_path = fixture_paths["canonical_nexus"]
    before = nexus_path.read_bytes()

    preflight_projection(nexus_path=nexus_path, plan=plan)

    assert nexus_path.read_bytes() == before
    assert not list(nexus_path.parent.glob("*.openpmd.*"))


def test_load_projection_plan_rejects_a_non_object_document(tmp_path: Path):
    path = tmp_path / "plan.json"
    path.write_text("[]", encoding="utf-8")

    with pytest.raises(ProjectionPlanError):
        load_projection_plan(path)


# --------------------------------------------------------------------------
# Cross-repository: the plan nexus-design-studio actually ships
# --------------------------------------------------------------------------

_NDS_EXAMPLE = (
    Path(__file__).parents[3]
    / "nexus-design-studio"
    / "docs"
    / "schemas"
    / "examples"
    / "openpmd-projection-plan.example.yaml"
)


@pytest.mark.skipif(
    not _NDS_EXAMPLE.exists(), reason="nexus-design-studio sibling repo not found"
)
def test_the_shipped_nds_example_plan_resolves_against_the_canonical_fixture(
    fixture_paths: dict[str, Path],
):
    """The reviewed contract and the canonical file must agree across repos.

    NDS owns the plan and its schema; DAMNIT owns the paths. This is the one
    test that fails when either side drifts from the other - the sibling repo's
    own suite only checks that its example is *self*-consistent.
    """
    pytest.importorskip("yaml", reason="PyYAML is not a damnit-api dependency")
    plan = load_projection_plan(_NDS_EXAMPLE)

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=plan
    )

    assert report["status"] == "pass"
    assert report["iteration"]["shot_count"] == 3
    assert report["counts"]["rejected"] == 0
    assert {rule["source"] for rule in report["rules"]} == {
        "shotcounter",
        "planet-watchdog",
        "labfrog",
        "asapo",
    }


# --------------------------------------------------------------------------
# Envelope and role/policy rejections
# --------------------------------------------------------------------------


def test_preflight_stops_when_the_entry_group_is_absent(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    broken = copy.deepcopy(plan)
    broken["source"]["entry_path"] = "/not_an_entry"

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    assert report["status"] == "fail"
    assert report["rules"] == []
    assert "entry_path_missing" in {issue["code"] for issue in report["plan_issues"]}


def test_preflight_rejects_a_plan_with_no_rules(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    empty = copy.deepcopy(plan)
    empty["rules"] = []

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=empty
    )

    assert report["status"] == "fail"
    assert "plan_rules_missing" in {issue["code"] for issue in report["plan_issues"]}


def test_preflight_warns_that_a_campaign_scalar_has_to_be_broadcast(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """`/entry/instrument/laser/pulse_energy` is one value for the whole campaign."""
    broadcast = copy.deepcopy(plan)
    broadcast["rules"] = [
        {
            "source": "asapo",
            "source_path": "/entry/instrument/laser/pulse_energy",
            "role": "iteration_attribute",
            "target_name": "hzdr.campaign_pulse_energy",
            "materialization": "inline",
        }
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broadcast
    )

    rule = _rule(report, "hzdr.campaign_pulse_energy")
    assert rule["axis"] == "campaign"
    assert rule["status"] == "accepted"
    assert "source_axis_campaign_broadcast" in _codes(rule)


def test_no_canonical_path_yet_satisfies_an_inline_mesh(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """A finding for Phase 3, pinned so it cannot change silently.

    The canonical file carries no shot-aligned array product: per-event payload
    arrays live under `/entry/<source>/<kind>/<event_id>/values` and are indexed
    by neither the shot nor a bridge table. Until one exists, every `mesh` rule
    has to go through `resolve_payload`.
    """
    inline_mesh = copy.deepcopy(plan)
    inline_mesh["rules"] = [
        {
            "source": "labfrog",
            "source_path": "/entry/derived/ict_charge",
            "role": "mesh",
            "target_name": "ict_charge_mesh",
            "component": "value",
            "materialization": "inline",
            "required": True,
        },
        {
            "source": "asapo",
            "source_path": "/entry/laserdata/laser_shot/laserdata-101/values",
            "role": "mesh",
            "target_name": "laser_values_mesh",
            "component": "value",
            "materialization": "inline",
        },
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=inline_mesh
    )

    # Shot-aligned but rank 1: no component dimension to make a mesh out of.
    assert "source_rank_unsupported" in _codes(_rule(report, "ict_charge_mesh"))
    # Rank 2 but on no canonical axis: one event's payload, not a shot series.
    per_event = _rule(report, "laser_values_mesh")
    assert per_event["axis"] == "unaligned"
    assert "source_axis_unaligned" in _codes(per_event)
    assert report["status"] == "fail"


def test_preflight_rejects_incoherent_roles_and_policies(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """The plan model catches these; a hand-written JSON plan must not slip by."""
    broken = copy.deepcopy(plan)
    broken["rules"] = [
        {
            "source": "labfrog",
            "source_path": "/entry/derived/ict_charge",
            "role": "particle_species",
            "target_name": "unknown_role",
            "materialization": "inline",
        },
        {
            "source": "labfrog",
            "source_path": "/entry/shots/shot_number",
            "role": "scalar_mesh",
            "target_name": "no_component",
            "materialization": "teleport",
        },
        {
            "source": "asapo",
            "source_path": "/entry/source_events/payload_ref_json",
            "role": "mesh",
            "target_name": "no_selector",
            "component": "value",
            "materialization": "resolve_payload",
        },
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    assert "role_unsupported" in _codes(_rule(report, "unknown_role"))
    assert {"materialization_unsupported", "component_missing"} <= _codes(
        _rule(report, "no_component")
    )
    assert "payload_selector_missing" in _codes(_rule(report, "no_selector"))
    assert report["counts"]["rejected"] == 3


def test_a_reference_on_an_unjoinable_axis_is_rejected(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    broken = copy.deepcopy(plan)
    broken["rules"] = [
        {
            "source": "asapo",
            "source_path": "/entry/laserdata/laser_shot/laserdata-101/values",
            "role": "reference",
            "target_name": "loose_reference",
            "materialization": "reference_only",
        }
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    assert "source_axis_unaligned" in _codes(_rule(report, "loose_reference"))


def test_labfrog_history_is_its_own_axis_and_never_an_iteration(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """Bridge profile v7: a superseded LabFrog version is not a shot."""
    broken = copy.deepcopy(plan)
    broken["rules"] = [
        {
            "source": "labfrog",
            "source_path": "/entry/labfrog_history/authority_shot_number",
            "role": "scalar_mesh",
            "target_name": "history_number",
            "component": "value",
            "materialization": "inline",
        },
        {
            "source": "labfrog",
            "source_path": "/entry/labfrog_history/record_id",
            "role": "reference",
            "target_name": "history_record",
            "materialization": "reference_only",
        },
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    number = _rule(report, "history_number")
    assert number["axis"] == "labfrog_history"
    assert "source_axis_unaligned" in _codes(number)
    # No shot_key column: a history row cannot be joined to an iteration.
    assert "reference_join_column_missing" in _codes(_rule(report, "history_record"))


# --------------------------------------------------------------------------
# Payload policy
# --------------------------------------------------------------------------


def test_report_carries_the_reviewed_payload_policy(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=plan
    )

    assert report["payload_policy"] == {
        "max_resolve_bytes": 16 * 1024 * 1024,
        "on_oversize": "reference_only",
        "on_pending": "reference_only",
        "require_checksum": False,
    }
    # The ceiling reaches the rule that will have to obey it.
    deferred = _rule(report, "laser_near_field")
    assert deferred["status"] == "deferred"
    assert deferred["max_resolve_bytes"] == 16 * 1024 * 1024


def test_an_absent_payload_policy_means_the_defaults_not_unlimited(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """The failure mode worth guarding: a missing block reading as 'no limit'."""
    without = copy.deepcopy(plan)
    del without["payload_policy"]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=without
    )

    assert report["payload_policy"]["max_resolve_bytes"] == 16 * 1024 * 1024
    assert report["payload_policy"]["on_pending"] == "reference_only"
    assert report["status"] == "pass"


def test_a_strict_payload_policy_is_carried_through(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    strict = copy.deepcopy(plan)
    strict["payload_policy"]["on_oversize"] = "reject"
    strict["payload_policy"]["on_pending"] = "reject"
    strict["payload_policy"]["max_resolve_bytes"] = 1024

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=strict
    )

    assert report["payload_policy"]["on_oversize"] == "reject"
    assert report["payload_policy"]["on_pending"] == "reject"
    assert _rule(report, "laser_near_field")["max_resolve_bytes"] == 1024
    assert report["status"] == "pass"


@pytest.mark.parametrize(
    ("field_name", "value", "code"),
    [
        ("max_resolve_bytes", 0, "payload_policy_invalid_limit"),
        ("max_resolve_bytes", -1, "payload_policy_invalid_limit"),
        ("max_resolve_bytes", "16MB", "payload_policy_invalid_limit"),
        ("on_oversize", "truncate", "payload_policy_unknown_fallback"),
        ("on_pending", "retry", "payload_policy_unknown_fallback"),
        ("require_checksum", "yes", "payload_policy_invalid_checksum_flag"),
    ],
)
def test_an_unusable_payload_policy_value_is_reported_not_honoured(
    fixture_paths: dict[str, Path],
    plan: dict[str, Any],
    field_name: str,
    value: Any,
    code: str,
):
    """A typo must not silently widen a limit."""
    broken = copy.deepcopy(plan)
    broken["payload_policy"][field_name] = value

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    assert code in {issue["code"] for issue in report["plan_issues"]}
    assert report["status"] == "fail"
    # Rejected, and the reviewed default stands in its place.
    assert report["payload_policy"]["max_resolve_bytes"] > 0
    assert report["payload_policy"]["on_oversize"] in {"reference_only", "reject"}


def test_a_malformed_payload_policy_block_is_rejected(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    broken = copy.deepcopy(plan)
    broken["payload_policy"] = "16MB"

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=broken
    )

    assert "payload_policy_malformed" in {
        issue["code"] for issue in report["plan_issues"]
    }
    assert report["payload_policy"]["max_resolve_bytes"] == 16 * 1024 * 1024


def test_a_plan_that_resolves_to_nothing_does_not_report_pass(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """The shape a freshly compiled NDS draft arrives in.

    None of its rules is `required`, so without an explicit check every rule
    could be rejected and the run would still say `pass` — the reassuring
    answer in exactly the case that most needs a clear one.
    """
    nothing = copy.deepcopy(plan)
    nothing["rules"] = [
        {
            "source": "nds",
            "source_path": "/entry/absent_one",
            "role": "scalar_mesh",
            "target_name": "absent_one",
            "component": "value",
            "materialization": "inline",
        },
        {
            "source": "nds",
            "source_path": "/entry/absent_two",
            "role": "iteration_attribute",
            "target_name": "absent_two",
            "materialization": "inline",
        },
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=nothing
    )

    assert report["counts"] == {"accepted": 0, "deferred": 0, "rejected": 2}
    assert report["status"] == "fail"
    assert "no_rule_resolved" in {issue["code"] for issue in report["plan_issues"]}


def test_one_usable_rule_is_enough_to_avoid_that(
    fixture_paths: dict[str, Path], plan: dict[str, Any]
):
    """A partial plan still passes: an optional rejected rule is the policy."""
    partial = copy.deepcopy(plan)
    partial["rules"] = [
        {
            "source": "labfrog",
            "source_path": "/entry/derived/ict_charge",
            "role": "scalar_mesh",
            "target_name": "ict_charge",
            "component": "value",
            "materialization": "inline",
        },
        {
            "source": "nds",
            "source_path": "/entry/absent",
            "role": "scalar_mesh",
            "target_name": "absent",
            "component": "value",
            "materialization": "inline",
        },
    ]

    report = preflight_projection(
        nexus_path=fixture_paths["canonical_nexus"], plan=partial
    )

    assert report["counts"]["accepted"] == 1
    assert report["status"] == "pass"
    assert "no_rule_resolved" not in {issue["code"] for issue in report["plan_issues"]}
