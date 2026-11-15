"""Preflight a reviewed openPMD projection plan against a canonical NeXus file.

This module **never writes openPMD**. It answers one question: given the
completed canonical campaign file DAMNIT already builds, which rules of a
nexus-design-studio `OpenPMDProjectionPlan` can a projector actually resolve,
and why not for the rest. Phase 3 of
`hzdr/docs/plans/openpmd-projection-plan.md` owns the writer; this is the gate
that runs before it and the evidence record that says what the canonical file
is still missing.

Three outcomes per rule, and `required` is what makes the difference between a
note and a failure:

* **accepted** - the rule's own `source_path` resolves to a dataset on an axis
  the role can use. An unresolvable *provenance* side path (`event_id_path`,
  `producer_instance_path`) is a warning here, because the value is still
  projectable without it.
* **deferred** - structurally resolvable, but resolution is deliberately not
  attempted (`resolve_payload`; Phase 4 owns payload materialization).
* **rejected** - the rule's own data cannot be resolved, or a `required: true`
  rule carries any warning.

The report is JSON-serializable and stable: reason codes are part of the
contract, so a projector or a CI gate can key on them.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import h5py
import numpy as np

if TYPE_CHECKING:
    from pathlib import Path

PREFLIGHT_REPORT_VERSION = "hzdr-openpmd-preflight-v1"

# Kept in step with nexus_design_studio.core.models.OpenPMDProjectionPlan. A
# plan naming anything else is refused rather than half-interpreted.
SUPPORTED_PLAN_SCHEMA_VERSIONS = frozenset({"1.0"})
SUPPORTED_OPENPMD_STANDARDS = frozenset({"1.1.0"})

ITERATION_ATTRIBUTE = "iteration_attribute"
SCALAR_MESH = "scalar_mesh"
MESH = "mesh"
REFERENCE = "reference"
SUPPORTED_ROLES = frozenset({ITERATION_ATTRIBUTE, SCALAR_MESH, MESH, REFERENCE})

INLINE = "inline"
RESOLVE_PAYLOAD = "resolve_payload"
REFERENCE_ONLY = "reference_only"
SUPPORTED_MATERIALIZATIONS = frozenset({INLINE, RESOLVE_PAYLOAD, REFERENCE_ONLY})

SHOT_AXIS = "shot"
EVENT_AXIS = "event"
PRODUCT_AXIS = "product"
HISTORY_AXIS = "labfrog_history"
CAMPAIGN_AXIS = "campaign"
UNALIGNED_AXIS = "unaligned"

# Canonical bridge tables indexed by something other than the shot. Membership
# is decided by group, never by a coincidental length match.
_TABLE_AXES = {
    "source_events": EVENT_AXIS,
    "data_products": PRODUCT_AXIS,
    # Bridge profile v7: superseded LabFrog versions. No shot_key column, so
    # a rule reaching it is never attributed to an iteration.
    "labfrog_history": HISTORY_AXIS,
}
_TABLE_COUNT_COLUMNS = {
    EVENT_AXIS: "event_index",
    PRODUCT_AXIS: "product_index",
    HISTORY_AXIS: "history_index",
}

# Payload limits. Kept in step with nexus_design_studio's OpenPMDPayloadPolicy,
# whose defaults are the reviewed HZDR numbers - an omitted block must never
# read as "no limit", so the same defaults are applied here.
DEFAULT_MAX_RESOLVE_BYTES = 16 * 1024 * 1024
REFERENCE_ONLY_FALLBACK = "reference_only"
REJECT_FALLBACK = "reject"
SUPPORTED_PAYLOAD_FALLBACKS = frozenset({REFERENCE_ONLY_FALLBACK, REJECT_FALLBACK})

ERROR = "error"
WARNING = "warning"


class ProjectionPlanError(ValueError):
    """The supplied plan cannot be interpreted at all."""


@dataclass
class Issue:
    """One stable reason code attached to the plan, iteration, or a rule."""

    code: str
    severity: str
    detail: str


@dataclass
class RuleReport:
    """Preflight outcome for one projection rule."""

    index: int
    source: str
    source_path: str
    role: str
    materialization: str
    target_name: str
    component: str | None
    required: bool
    status: str = "accepted"
    axis: str | None = None
    dtype: str | None = None
    shape: list[int] = field(default_factory=list)
    units: str | None = None
    join_column: str | None = None
    # Only set on a resolve_payload rule: the ceiling the projector will apply.
    max_resolve_bytes: int | None = None
    issues: list[Issue] = field(default_factory=list)

    def add(self, code: str, severity: str, detail: str) -> None:
        self.issues.append(Issue(code=code, severity=severity, detail=detail))


def load_projection_plan(path: Path) -> dict[str, Any]:
    """Load a projection plan from JSON, or YAML when PyYAML is importable.

    JSON is the interchange form this preflight guarantees: `damnit-api` does
    not depend on PyYAML, so a `.yaml` plan is read only when something else in
    the environment already provides it. NDS can export either form.
    """
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() in {".yaml", ".yml"}:
        try:
            import yaml
        except ImportError as error:  # pragma: no cover - environment dependent
            message = (
                f"{path} is YAML but PyYAML is not installed; export the plan as "
                "JSON or install PyYAML"
            )
            raise ProjectionPlanError(message) from error
        loaded = yaml.safe_load(text)
    else:
        loaded = json.loads(text)
    if not isinstance(loaded, dict):
        message = f"{path} does not contain a projection-plan object"
        raise ProjectionPlanError(message)
    return loaded


def preflight_projection(*, nexus_path: Path, plan: dict[str, Any]) -> dict[str, Any]:
    """Resolve `plan` against the completed canonical file at `nexus_path`.

    Returns a JSON-serializable report. Opens the file read-only and never
    produces openPMD output.
    """
    plan_issues = _check_plan_envelope(plan)
    payload_policy, policy_issues = _resolve_payload_policy(plan)
    plan_issues.extend(policy_issues)
    rules = plan.get("rules")
    if not isinstance(rules, list) or not rules:
        plan_issues.append(
            Issue("plan_rules_missing", ERROR, "plan carries no projection rules")
        )
        rules = []
    plan_issues.extend(_check_rule_uniqueness(rules))

    entry_path = _entry_path(plan)
    with h5py.File(nexus_path, "r") as handle:
        if not isinstance(handle.get(entry_path), h5py.Group):
            plan_issues.append(
                Issue(
                    "entry_path_missing",
                    ERROR,
                    f"{entry_path} is not a group in {nexus_path.name}",
                )
            )
            return _assemble(
                nexus_path=nexus_path,
                plan=plan,
                plan_issues=plan_issues,
                iteration={"issues": []},
                rule_reports=[],
                payload_policy=payload_policy,
            )

        iteration, shot_count = _preflight_iteration(handle, plan)
        axis_lengths = _axis_lengths(handle, entry_path, shot_count)
        rule_reports = [
            _preflight_rule(
                handle,
                rule if isinstance(rule, dict) else {},
                index=index,
                entry_path=entry_path,
                axis_lengths=axis_lengths,
                payload_policy=payload_policy,
            )
            for index, rule in enumerate(rules)
        ]

    return _assemble(
        nexus_path=nexus_path,
        plan=plan,
        plan_issues=plan_issues,
        iteration=iteration,
        rule_reports=rule_reports,
        payload_policy=payload_policy,
    )


def _check_plan_envelope(plan: dict[str, Any]) -> list[Issue]:
    issues: list[Issue] = []
    schema_version = str(plan.get("schema_version", ""))
    if schema_version not in SUPPORTED_PLAN_SCHEMA_VERSIONS:
        issues.append(
            Issue(
                "plan_schema_version_unsupported",
                ERROR,
                f"schema_version {schema_version!r} is not one of "
                f"{sorted(SUPPORTED_PLAN_SCHEMA_VERSIONS)}",
            )
        )
    standard = str(plan.get("openpmd_standard", ""))
    if standard not in SUPPORTED_OPENPMD_STANDARDS:
        issues.append(
            Issue(
                "plan_standard_unsupported",
                ERROR,
                f"openpmd_standard {standard!r} is not one of "
                f"{sorted(SUPPORTED_OPENPMD_STANDARDS)}",
            )
        )
    source = plan.get("source")
    kind = source.get("kind") if isinstance(source, dict) else None
    if kind != "damnit_campaign_nexus":
        issues.append(
            Issue(
                "plan_source_kind_unsupported",
                ERROR,
                f"source.kind {kind!r} is not 'damnit_campaign_nexus'",
            )
        )
    return issues


def _resolve_payload_policy(plan: dict[str, Any]) -> tuple[dict[str, Any], list[Issue]]:
    """Fill the payload policy from the plan, defaults first.

    An absent block is the reviewed default, never "unlimited" - a projector
    reading this report must find a ceiling whether or not the plan author
    wrote one down. An unusable value is reported and replaced by the default
    rather than silently honoured, so a typo cannot widen a limit.
    """
    issues: list[Issue] = []
    policy: dict[str, Any] = {
        "max_resolve_bytes": DEFAULT_MAX_RESOLVE_BYTES,
        "on_oversize": REFERENCE_ONLY_FALLBACK,
        "on_pending": REFERENCE_ONLY_FALLBACK,
        "require_checksum": False,
    }
    supplied = plan.get("payload_policy")
    if supplied is None:
        return policy, issues
    if not isinstance(supplied, dict):
        issues.append(
            Issue(
                "payload_policy_malformed",
                ERROR,
                "payload_policy must be an object",
            )
        )
        return policy, issues

    limit = supplied.get("max_resolve_bytes")
    if limit is not None:
        if isinstance(limit, int) and not isinstance(limit, bool) and limit > 0:
            policy["max_resolve_bytes"] = limit
        else:
            issues.append(
                Issue(
                    "payload_policy_invalid_limit",
                    ERROR,
                    f"max_resolve_bytes {limit!r} is not a positive integer; "
                    f"falling back to {DEFAULT_MAX_RESOLVE_BYTES}",
                )
            )

    for name in ("on_oversize", "on_pending"):
        fallback = supplied.get(name)
        if fallback is None:
            continue
        if fallback in SUPPORTED_PAYLOAD_FALLBACKS:
            policy[name] = fallback
        else:
            issues.append(
                Issue(
                    "payload_policy_unknown_fallback",
                    ERROR,
                    f"{name} {fallback!r} is not one of "
                    f"{sorted(SUPPORTED_PAYLOAD_FALLBACKS)}",
                )
            )

    require_checksum = supplied.get("require_checksum")
    if isinstance(require_checksum, bool):
        policy["require_checksum"] = require_checksum
    elif require_checksum is not None:
        issues.append(
            Issue(
                "payload_policy_invalid_checksum_flag",
                ERROR,
                f"require_checksum {require_checksum!r} is not a boolean",
            )
        )
    return policy, issues


def _check_rule_uniqueness(rules: list[Any]) -> list[Issue]:
    """Repeat the plan model's uniqueness rules, for hand-written JSON."""
    issues: list[Issue] = []
    seen_paths: set[str] = set()
    seen_destinations: set[tuple[str, str, Any]] = set()
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict):
            issues.append(
                Issue("rule_malformed", ERROR, f"rule {index} is not an object")
            )
            continue
        source_path = str(rule.get("source_path", ""))
        if source_path in seen_paths:
            issues.append(
                Issue(
                    "duplicate_source_path",
                    ERROR,
                    f"rule {index} repeats source_path {source_path}",
                )
            )
        seen_paths.add(source_path)
        role = str(rule.get("role", ""))
        namespace = "mesh" if role in {SCALAR_MESH, MESH} else role
        destination = (
            namespace,
            str(rule.get("target_name", "")),
            rule.get("component"),
        )
        if destination in seen_destinations:
            issues.append(
                Issue(
                    "duplicate_destination",
                    ERROR,
                    f"rule {index} repeats openPMD destination {destination}",
                )
            )
        seen_destinations.add(destination)
    return issues


def _entry_path(plan: dict[str, Any]) -> str:
    source = plan.get("source")
    if isinstance(source, dict):
        return str(source.get("entry_path") or "/entry")
    return "/entry"


def _preflight_iteration(
    handle: h5py.File, plan: dict[str, Any]
) -> tuple[dict[str, Any], int]:
    """Resolve the iteration contract; its shot count anchors every axis check."""
    contract = plan.get("iteration")
    contract = contract if isinstance(contract, dict) else {}
    issues: list[Issue] = []
    index_path = str(contract.get("index_path", ""))
    index_dataset = handle.get(index_path) if index_path else None

    shot_count = 0
    if not isinstance(index_dataset, h5py.Dataset):
        issues.append(
            Issue(
                "iteration_index_missing",
                ERROR,
                f"iteration.index_path {index_path!r} is not a dataset",
            )
        )
    elif index_dataset.ndim != 1:
        issues.append(
            Issue(
                "iteration_index_not_one_dimensional",
                ERROR,
                f"{index_path} has rank {index_dataset.ndim}, expected 1",
            )
        )
    else:
        shot_count = int(index_dataset.shape[0])

    resolved: dict[str, Any] = {"index_path": index_path or None}
    for name in (
        "shot_id_path",
        "shot_number_path",
        "trigger_time_path",
        "match_quality_path",
    ):
        path = contract.get(name)
        resolved[name] = path
        if path is None:
            continue
        dataset = handle.get(str(path))
        if not isinstance(dataset, h5py.Dataset):
            # shot_id_path is the iteration's stable identity; the rest are
            # descriptive, so their absence degrades the projection instead of
            # invalidating it.
            severity = ERROR if name == "shot_id_path" else WARNING
            issues.append(
                Issue(
                    "iteration_path_missing",
                    severity,
                    f"iteration.{name} {path!r} is not a dataset",
                )
            )
            continue
        if shot_count and (dataset.ndim != 1 or int(dataset.shape[0]) != shot_count):
            issues.append(
                Issue(
                    "iteration_length_mismatch",
                    ERROR,
                    f"iteration.{name} {path} has shape {list(dataset.shape)}, "
                    f"expected ({shot_count},)",
                )
            )

    iteration = {
        "shot_count": shot_count,
        "paths": resolved,
        "shot_ids": _read_strings(handle, contract.get("shot_id_path"), shot_count),
        "issues": issues,
    }
    return iteration, shot_count


def _read_strings(handle: h5py.File, path: Any, count: int) -> list[str]:
    if not path or not count:
        return []
    dataset = handle.get(str(path))
    if not isinstance(dataset, h5py.Dataset) or dataset.ndim != 1:
        return []
    if dataset.dtype.kind in {"S", "O", "U"}:
        return [str(value) for value in dataset.asstr()[...]]
    return [str(_python_scalar(value)) for value in dataset[...]]


def _axis_lengths(
    handle: h5py.File, entry_path: str, shot_count: int
) -> dict[str, int]:
    lengths = {SHOT_AXIS: shot_count}
    prefix = entry_path.rstrip("/")
    for table, axis in _TABLE_AXES.items():
        column = handle.get(f"{prefix}/{table}/{_TABLE_COUNT_COLUMNS[axis]}")
        if isinstance(column, h5py.Dataset) and column.ndim == 1:
            lengths[axis] = int(column.shape[0])
    return lengths


def _preflight_rule(
    handle: h5py.File,
    rule: dict[str, Any],
    *,
    index: int,
    entry_path: str,
    axis_lengths: dict[str, int],
    payload_policy: dict[str, Any],
) -> RuleReport:
    role = str(rule.get("role", ""))
    materialization = str(rule.get("materialization", ""))
    source_path = str(rule.get("source_path", ""))
    report = RuleReport(
        index=index,
        source=str(rule.get("source", "")),
        source_path=source_path,
        role=role,
        materialization=materialization,
        target_name=str(rule.get("target_name", "")),
        component=rule.get("component"),
        required=bool(rule.get("required")),
    )

    _check_rule_shape(report, rule)
    _resolve_rule_source(report, handle, entry_path, axis_lengths)
    _check_provenance_paths(report, rule, handle, entry_path, axis_lengths)

    if materialization == RESOLVE_PAYLOAD and not _has(report, ERROR):
        limit = payload_policy["max_resolve_bytes"]
        report.max_resolve_bytes = limit
        report.add(
            "payload_resolution_deferred",
            WARNING,
            "preflight does not resolve payloads; the projector applies "
            f"max_resolve_bytes={limit} and degrades per on_oversize="
            f"{payload_policy['on_oversize']} / on_pending="
            f"{payload_policy['on_pending']}",
        )

    _finalize(report)
    return report


def _check_rule_shape(report: RuleReport, rule: dict[str, Any]) -> None:
    """Reject a rule the plan model would never have produced."""
    if report.role not in SUPPORTED_ROLES:
        report.add(
            "role_unsupported", ERROR, f"role {report.role!r} is not projectable"
        )
    if report.materialization not in SUPPORTED_MATERIALIZATIONS:
        report.add(
            "materialization_unsupported",
            ERROR,
            f"materialization {report.materialization!r} is not projectable",
        )
    if report.role in {SCALAR_MESH, MESH} and rule.get("component") is None:
        report.add(
            "component_missing", ERROR, f"{report.role} rules require a component"
        )
    if report.materialization == RESOLVE_PAYLOAD and not rule.get("payload_selector"):
        report.add(
            "payload_selector_missing",
            ERROR,
            "resolve_payload rules require payload_selector",
        )


def _resolve_rule_source(
    report: RuleReport,
    handle: h5py.File,
    entry_path: str,
    axis_lengths: dict[str, int],
) -> None:
    source_path = report.source_path
    if not source_path or source_path not in handle:
        report.add(
            "source_path_missing",
            ERROR,
            f"{source_path or '<unset>'} is absent from the file",
        )
        return
    dataset = handle.get(source_path)
    if not isinstance(dataset, h5py.Dataset):
        report.add("source_path_not_dataset", ERROR, f"{source_path} is not a dataset")
        return
    report.dtype = str(dataset.dtype)
    report.shape = [int(value) for value in dataset.shape]
    report.units = _units(dataset)
    report.axis = _classify_axis(source_path, dataset, entry_path, axis_lengths)
    _check_axis_for_role(report, dataset, entry_path=entry_path, handle=handle)


def _classify_axis(
    path: str,
    dataset: h5py.Dataset,
    entry_path: str,
    axis_lengths: dict[str, int],
) -> str:
    """Name the axis a dataset is indexed by, group membership first.

    `/entry/source_events` and `/entry/data_products` are event- and
    product-indexed tables. Deciding by group rather than by length keeps a
    campaign whose event count happens to equal its shot count from being
    misread as shot-aligned.
    """
    prefix = entry_path.rstrip("/")
    for table, axis in _TABLE_AXES.items():
        if path.startswith(f"{prefix}/{table}/"):
            return axis
    if dataset.ndim == 0:
        return CAMPAIGN_AXIS
    shot_count = axis_lengths.get(SHOT_AXIS, 0)
    if shot_count and int(dataset.shape[0]) == shot_count:
        return SHOT_AXIS
    if int(dataset.shape[0]) == 1:
        return CAMPAIGN_AXIS
    return UNALIGNED_AXIS


def _check_axis_for_role(
    report: RuleReport,
    dataset: h5py.Dataset,
    *,
    entry_path: str,
    handle: h5py.File,
) -> None:
    numeric = bool(np.issubdtype(dataset.dtype, np.number))
    if report.role in {ITERATION_ATTRIBUTE, SCALAR_MESH}:
        _check_shot_aligned(report)
        if report.role == SCALAR_MESH:
            if not numeric:
                report.add(
                    "source_not_numeric",
                    ERROR,
                    f"{report.source_path} has dtype {dataset.dtype}; a mesh "
                    "record component must be numeric",
                )
            if dataset.ndim > 1:
                report.add(
                    "source_rank_unsupported",
                    ERROR,
                    f"{report.source_path} has rank {dataset.ndim}; scalar_mesh "
                    "needs a rank-1 shot-aligned dataset",
                )
        return

    if report.role == MESH:
        if report.materialization == RESOLVE_PAYLOAD:
            _require_join(report, handle, entry_path)
        else:
            _check_inline_mesh(report, dataset, numeric=numeric)
        return

    if report.role == REFERENCE:
        _require_join(report, handle, entry_path)


def _check_inline_mesh(
    report: RuleReport, dataset: h5py.Dataset, *, numeric: bool
) -> None:
    """An inline mesh reads real array data straight off the shot axis."""
    if report.axis != SHOT_AXIS:
        report.add(
            "source_axis_unaligned",
            ERROR,
            f"{report.source_path} is {report.axis}-indexed; an inline mesh "
            "needs the shot axis on its first dimension",
        )
    if not numeric:
        report.add(
            "source_not_numeric",
            ERROR,
            f"{report.source_path} has dtype {dataset.dtype}; a mesh record "
            "component must be numeric",
        )
    if dataset.ndim < 2:
        report.add(
            "source_rank_unsupported",
            ERROR,
            f"{report.source_path} has rank {dataset.ndim}; an inline mesh "
            "needs at least one component dimension after the shot axis",
        )


def _check_shot_aligned(report: RuleReport) -> None:
    if report.axis == CAMPAIGN_AXIS:
        report.add(
            "source_axis_campaign_broadcast",
            WARNING,
            f"{report.source_path} is campaign-level; the projector must "
            "broadcast one value across every iteration",
        )
    elif report.axis != SHOT_AXIS:
        report.add(
            "source_axis_unaligned",
            ERROR,
            f"{report.source_path} is {report.axis}-indexed; "
            f"{report.role} needs the shot axis",
        )


def _require_join(report: RuleReport, handle: h5py.File, entry_path: str) -> None:
    """A non-shot-axis row is usable only through an explicit `shot_key` join."""
    if report.axis in {SHOT_AXIS, CAMPAIGN_AXIS}:
        return
    if report.axis == UNALIGNED_AXIS:
        report.add(
            "source_axis_unaligned",
            ERROR,
            f"{report.source_path} is on no canonical axis",
        )
        return
    table = next(name for name, axis in _TABLE_AXES.items() if axis == report.axis)
    join_column = f"{entry_path.rstrip('/')}/{table}/shot_key"
    if isinstance(handle.get(join_column), h5py.Dataset):
        report.join_column = join_column
        report.add(
            "source_axis_joined",
            WARNING,
            f"{report.source_path} is {report.axis}-indexed; the projector must "
            f"join to the shot axis through {join_column}, not by position",
        )
        return
    report.add(
        "reference_join_column_missing",
        ERROR,
        f"{report.source_path} is {report.axis}-indexed and {join_column} is "
        "absent, so its rows cannot be attributed to an iteration",
    )


def _check_provenance_paths(
    report: RuleReport,
    rule: dict[str, Any],
    handle: h5py.File,
    entry_path: str,
    axis_lengths: dict[str, int],
) -> None:
    """Resolve `event_id_path` / `producer_instance_path`.

    These annotate a projected value; they are never the value itself. A gap is
    a warning, so an optional rule still projects, and `required: true` is what
    turns the gap into a rejection (see `_finalize`).
    """
    for name, code in (
        ("event_id_path", "event_id_path_missing"),
        ("producer_instance_path", "producer_instance_path_missing"),
    ):
        path = rule.get(name)
        if path is None:
            continue
        dataset = handle.get(str(path))
        if not isinstance(dataset, h5py.Dataset):
            report.add(
                code,
                WARNING,
                f"{name} {path!r} is absent; the projection cannot carry that "
                "provenance for this rule",
            )
            continue
        if report.axis is None:
            continue
        axis = _classify_axis(str(path), dataset, entry_path, axis_lengths)
        if axis not in {report.axis, CAMPAIGN_AXIS}:
            report.add(
                "provenance_axis_mismatch",
                WARNING,
                f"{name} {path} is {axis}-indexed while the value is "
                f"{report.axis}-indexed; the projector must join, not zip",
            )


def _finalize(report: RuleReport) -> None:
    """Set the rule status. `required` promotes every warning to a rejection."""
    if report.required:
        for issue in report.issues:
            if issue.severity == WARNING:
                issue.severity = ERROR
    if _has(report, ERROR):
        report.status = "rejected"
    elif any(issue.code == "payload_resolution_deferred" for issue in report.issues):
        report.status = "deferred"
    else:
        report.status = "accepted"


def _has(report: RuleReport, severity: str) -> bool:
    return any(issue.severity == severity for issue in report.issues)


def _assemble(
    *,
    nexus_path: Path,
    plan: dict[str, Any],
    plan_issues: list[Issue],
    iteration: dict[str, Any],
    rule_reports: list[RuleReport],
    payload_policy: dict[str, Any],
) -> dict[str, Any]:
    iteration_issues: list[Issue] = list(iteration.get("issues", []))
    usable = [
        report for report in rule_reports if report.status in {"accepted", "deferred"}
    ]
    # A plan whose every rule was rejected has nothing to project. Without this
    # it would report `pass` whenever no rule happened to be marked required —
    # which is exactly the shape a freshly compiled NDS draft arrives in, so the
    # one case that most needs a clear answer would get the reassuring one.
    if rule_reports and not usable:
        plan_issues = [
            *plan_issues,
            Issue(
                "no_rule_resolved",
                ERROR,
                f"all {len(rule_reports)} rule(s) were rejected; the plan "
                "resolves to nothing against this file",
            ),
        ]
    blocking = (
        any(issue.severity == ERROR for issue in plan_issues)
        or any(issue.severity == ERROR for issue in iteration_issues)
        or any(
            report.status == "rejected" and report.required for report in rule_reports
        )
    )
    counts = {
        "accepted": sum(1 for report in rule_reports if report.status == "accepted"),
        "deferred": sum(1 for report in rule_reports if report.status == "deferred"),
        "rejected": sum(1 for report in rule_reports if report.status == "rejected"),
    }
    source = plan.get("source")
    source = source if isinstance(source, dict) else {}
    return {
        "report_version": PREFLIGHT_REPORT_VERSION,
        "generated_at": datetime.now(UTC).isoformat(),
        "status": "fail" if blocking else "pass",
        "nexus_path": str(nexus_path),
        "plan": {
            "schema_version": plan.get("schema_version"),
            "openpmd_standard": plan.get("openpmd_standard"),
            "title": plan.get("title"),
            "source_ref": source.get("source_ref"),
            "entry_path": _entry_path(plan),
        },
        "payload_policy": dict(payload_policy),
        "plan_issues": [asdict(issue) for issue in plan_issues],
        "iteration": {
            "shot_count": iteration.get("shot_count", 0),
            "paths": iteration.get("paths", {}),
            "shot_ids": iteration.get("shot_ids", []),
            "issues": [asdict(issue) for issue in iteration_issues],
        },
        "counts": counts,
        "rules": [asdict(report) for report in rule_reports],
    }


def _units(dataset: h5py.Dataset) -> str | None:
    value = dataset.attrs.get("units")
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return str(value)


def _python_scalar(value: Any) -> Any:
    return value.item() if isinstance(value, np.generic) else value
