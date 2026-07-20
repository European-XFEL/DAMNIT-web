"""Domain models for runs.

All are implemented as plain stdlib dataclasses, it is assumed that
any required validation has already been done.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from ..shared.const import DamnitType

if TYPE_CHECKING:
    from ..shared.models import ProposalNumber


@dataclass(frozen=True)
class VariableValue:
    """A single variable's latest summarised value for one run."""

    value: Any
    summary_type: str | None
    timestamp: float
    attributes: str | None = None
    """Raw JSON `attributes` blob from `run_variables`; carries variable errors."""


@dataclass(frozen=True)
class RunRecord:
    """All variable values for a single run."""

    proposal: ProposalNumber
    run: int
    start_time: float | None
    added_at: float | None
    variables: dict[str, VariableValue] = field(default_factory=dict)


@dataclass
class VariableInfo:
    """Static metadata about one variable (from the `variables` table)."""

    name: str
    title: str | None
    tags: list[str] = field(default_factory=list)


@dataclass
class TagInfo:
    """A tag and the variables it is applied to."""

    id: int
    name: str
    variables: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class KnownVariable:
    """A hard-coded variable that every DAMNIT proposal exposes."""

    name: str
    title: str
    dtype: DamnitType


KNOWN_VARIABLES: tuple[KnownVariable, ...] = (
    KnownVariable(name="proposal", title="Proposal", dtype=DamnitType.NUMBER),
    KnownVariable(name="run", title="Run", dtype=DamnitType.NUMBER),
    KnownVariable(name="start_time", title="Timestamp", dtype=DamnitType.TIMESTAMP),
    KnownVariable(name="added_at", title="Added at", dtype=DamnitType.TIMESTAMP),
)


@dataclass(frozen=True)
class MetadataSnapshot:
    """Full proposal-level metadata: runs list, variable catalogue, tags."""

    runs: tuple[int, ...]
    variables: dict[str, VariableInfo]
    """All variables, keyed by variable name"""
    tags: dict[str, TagInfo]
    """All tags, keyed by tag name"""
    timestamp: float
