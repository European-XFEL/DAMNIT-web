import json
from dataclasses import asdict, dataclass
from typing import NewType

import strawberry

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

SCALAR_MAP = {
    Any: strawberry.scalar(name="Any"),
    Timestamp: strawberry.scalar(
        name="Timestamp",
        parse_value=lambda value: value / 1000,
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


@strawberry.type
class DamnitRun:
    _cells: strawberry.Private[list[Cell]]

    @strawberry.field
    def cells(self, names: list[str] | None = None) -> list[Cell]:
        if names is None:
            return self._cells
        requested = set(names)
        return [v for v in self._cells if v.name in requested]

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
    def from_db(cls, record):
        return cls(_cells=list(cls._iter_cells(record)))

    @classmethod
    def resolve(cls, record):
        out: dict[str, object | None] = {
            name: None for name, entry in record.items() if entry is None
        }

        for v in cls._iter_cells(record):
            if v.value is None and v.error is None:
                out[v.name] = None
                continue

            resolved = {"value": v.value, "dtype": v.dtype.value}
            if v.error is not None:
                resolved["error"] = asdict(v.error)

            out[v.name] = resolved
        return out

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
