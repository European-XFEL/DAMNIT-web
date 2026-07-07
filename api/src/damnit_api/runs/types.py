import json
from dataclasses import asdict
from typing import NewType

import strawberry

from .. import get_logger
from ..shared.const import DamnitType
from ..shared.models import ProposalNumber
from ..utils import (
    create_map,
    python_type_to_damnit_type,
    summary_type_to_damnit_type,
)
from .models import KNOWN_VARIABLES
from .serialization import serialize

logger = get_logger()

KNOWN_DTYPES = {v.name: v.dtype for v in KNOWN_VARIABLES}


Any = NewType("Any", object)
Timestamp = NewType("Timestamp", float)

SCALAR_MAP = {
    Any: strawberry.scalar(name="Any"),
    Timestamp: strawberry.scalar(
        name="Timestamp",
        parse_value=lambda value: value / 1000,
    ),
    ProposalNumber: strawberry.scalar(
        name="ProposalNo",
        serialize=int,
        parse_value=ProposalNumber,
        description="Proposal number (positive integer, 1-999999)",
    ),
}

strawberry.enum(DamnitType, graphql_name_from="value")


@strawberry.type
class DamnitVariableError:
    message: str
    cls: str

    @classmethod
    def from_attrs(cls, attributes):
        """Pull the error out of a `run_variables.attributes` value.

        When a variable fails to execute, DAMNIT stores a JSON string like
        ``{"error": "...", "error_cls": "..."}`` in the `attributes` column.
        Returns a `DamnitVariableError`, or None if there is no error.
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
class DamnitVariable:
    name: str
    value: Any | None
    dtype: DamnitType
    error: DamnitVariableError | None = None


@strawberry.type
class DamnitRun:
    _variables: strawberry.Private[list[DamnitVariable]]

    @strawberry.field
    def variables(self, names: list[str] | None = None) -> list[DamnitVariable]:
        if names is None:
            return self._variables
        requested = set(names)
        return [v for v in self._variables if v.name in requested]

    @classmethod
    def _iter_variables(cls, record):
        for name, entry in record.items():
            if entry is None:
                continue
            if not isinstance(entry, dict):
                entry = {"value": entry}
            dtype = cls.get_dtype(name, entry)
            value, dtype = serialize(entry["value"], dtype=dtype)
            error = DamnitVariableError.from_attrs(entry.get("attributes"))
            yield DamnitVariable(name=name, value=Any(value), dtype=dtype, error=error)

    @classmethod
    def from_db(cls, record):
        return cls(_variables=list(cls._iter_variables(record)))

    @classmethod
    def resolve(cls, record):
        out: dict[str, object | None] = {
            name: None for name, entry in record.items() if entry is None
        }

        for v in cls._iter_variables(record):
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
