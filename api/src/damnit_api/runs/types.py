import json
from dataclasses import dataclass
from typing import NewType

import strawberry
from strawberry.scalars import JSON

from .. import get_logger
from ..shared.const import DamnitType
from ..utils import (
    create_map,
    python_type_to_damnit_type,
    summary_type_to_damnit_type,
)
from .serialization import serialize

logger = get_logger()


@dataclass(frozen=True)
class KnownVariable:
    name: str
    title: str
    dtype: DamnitType


KNOWN_VARIABLES = (
    KnownVariable(name="proposal", title="Proposal", dtype=DamnitType.NUMBER),
    KnownVariable(name="run", title="Run", dtype=DamnitType.NUMBER),
    KnownVariable(name="start_time", title="Timestamp", dtype=DamnitType.TIMESTAMP),
    KnownVariable(name="added_at", title="Added at", dtype=DamnitType.TIMESTAMP),
)

KNOWN_DTYPES = {v.name: v.dtype for v in KNOWN_VARIABLES}


Any = NewType("Any", object)
Timestamp = NewType("Timestamp", float)

# The client works in JS milliseconds; the server works in seconds. Parse
# incoming cursors down to seconds and serialize outgoing ones back to
# milliseconds so both sides stay in their native unit.
SCALAR_MAP = {
    Any: strawberry.scalar(name="Any"),
    Timestamp: strawberry.scalar(
        name="Timestamp",
        parse_value=lambda value: value / 1000,
        serialize=lambda value: value * 1000,
    ),
}

strawberry.enum(DamnitType, graphql_name_from="value")


@strawberry.type
class CellError:
    message: str
    cls: str

    @classmethod
    def from_attrs(cls, attributes):
        """Pull the error out of a `run_variables.attributes` value.

        When a variable fails for one run, DAMNIT stores a JSON string like
        ``{"error": "...", "error_cls": "..."}`` in that cell's `attributes`
        column. Returns a `CellError`, or None if the cell has no error.
        """
        if not isinstance(attributes, str):
            return None
        try:
            attributes = json.loads(attributes)
        except ValueError:
            logger.error(
                "Failed to parse run_variables.attributes JSON: %r", attributes
            )
            return None
        if not isinstance(attributes, dict):
            return None

        message = attributes.get("error")
        error_cls = attributes.get("error_cls")
        if isinstance(message, str) and isinstance(error_cls, str):
            return cls(message=message, cls=error_cls)

        return None


@strawberry.type
class Cell:
    name: str
    value: Any | None
    dtype: DamnitType
    error: CellError | None = None


def _unwrap(entry):
    """Return the bare value whether the record entry is wrapped as
    ``{"value": ...}`` (from `fetch_cells`) or a raw scalar (from
    `run_info`)."""
    if isinstance(entry, dict):
        return entry.get("value")
    return entry


@strawberry.type
class RunId:
    proposal: str
    run: int


@strawberry.type
class DamnitRun:
    # Identity trio: `database` is the addressing handle echoed back, while
    # `proposal` and `run` are facts from the row. Runs collide across
    # proposals within one file, so all three are needed to key a run.
    database: str
    proposal: str
    run: int
    _cells: strawberry.Private[list[Cell]]

    @strawberry.field
    def cells(self, names: list[str] | None = None) -> list[Cell]:
        if names is None:
            return self._cells
        requested = set(names)
        return [c for c in self._cells if c.name in requested]

    @classmethod
    def _iter_cells(cls, record):
        for name, entry in record.items():
            if entry is None:
                continue
            if not isinstance(entry, dict):
                entry = {"value": entry}
            dtype = cls.get_dtype(name, entry)
            value, dtype = serialize(entry["value"], dtype=dtype)
            error = CellError.from_attrs(entry.get("attributes"))
            yield Cell(name=name, value=Any(value), dtype=dtype, error=error)

    @classmethod
    def from_db(cls, record, *, database):
        # Both callers key their rows on (proposal, run), so a record without
        # them is a bug upstream. Fail here rather than mint a `"None"`
        # proposal that quietly becomes a cache key on the client.
        proposal = _unwrap(record["proposal"])
        if proposal is None:
            msg = "Run record has no proposal."
            raise ValueError(msg)
        return cls(
            database=str(database),
            proposal=str(proposal),
            run=int(_unwrap(record["run"])),
            _cells=list(cls._iter_cells(record)),
        )

    @staticmethod
    def known_variables():
        return create_map(
            [{"name": v.name, "title": v.title, "tags": []} for v in KNOWN_VARIABLES],
            key="name",
        )

    @staticmethod
    def get_dtype(name, entry):
        known = KNOWN_DTYPES.get(name)
        if known is not None:
            return known

        summary_type = entry.get("summary_type")
        if summary_type is not None:
            dtype = summary_type_to_damnit_type(summary_type)
            if dtype is not None:
                return dtype

        value = entry.get("value")
        dtype = python_type_to_damnit_type(type(value))
        if dtype is not None:
            return dtype

        return DamnitType.STRING


@strawberry.type
class TableMeta:
    runs: list[RunId]
    variables: JSON
    tags: JSON
    timestamp: Timestamp

    @classmethod
    def from_snapshot(cls, snapshot):
        return cls(
            runs=[
                RunId(proposal=str(proposal), run=int(run))
                for proposal, run in snapshot["runs"]
            ],
            variables=snapshot["variables"],
            tags=snapshot["tags"],
            timestamp=snapshot["timestamp"],
        )
