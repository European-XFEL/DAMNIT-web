import json
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import NewType

import numpy as np
import strawberry
from damnit.api import blob2complex

from .. import get_logger
from ..shared.const import DamnitType
from ..utils import (
    b64image,
    blob2numpy,
    create_map,
    python_type_to_damnit_type,
    summary_type_to_damnit_type,
)

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


def to_javascript_string(value):
    if np.isnan(value):
        return "NaN"
    if value == np.inf:
        return "Infinity"
    if value == -np.inf:
        return "-Infinity"

    return str(value)


def to_complex_string(z, symbol="j"):
    real = z.real
    imag = z.imag

    def fmt(x):
        if isinstance(x, float) and x.is_integer():
            return str(int(x))
        if not np.isfinite(x):
            return str(x)
        decimal = int(-np.floor(np.log10(abs(x))))
        precision = decimal + 2 if decimal >= 0 else 1
        return str(round(x, precision))

    if imag == 0:
        return fmt(real)

    abs_imag = abs(imag)
    imag_part = symbol if abs_imag == 1 else f"{fmt(abs_imag)}{symbol}"

    if real == 0:
        return f"-{imag_part}" if imag < 0 else imag_part

    sign = "+" if imag >= 0 else "-"
    return f"{fmt(real)}{sign}{imag_part}"


def resample_array(arr):
    # Cast arrays to float (same as PyQt implementation)
    x = np.asarray(arr[0], dtype=np.float64)
    y = np.asarray(arr[1], dtype=np.float64)

    # Drop not finite values (same as PyQt implementation)
    finite = np.isfinite(x) & np.isfinite(y)
    x = x[finite]
    y = y[finite]

    # Order by x-axis
    order = np.argsort(x)
    x = x[order]
    y = y[order]

    # Remove duplicates, just in case
    x, unique_idx = np.unique(x, return_index=True)
    y = y[unique_idx]

    # Return immediately if there's only less than 2 elements
    if x.size < 2:
        return y

    # Build evenly-spaced x-axis (maybe using `size` is not the best)
    x_even = np.linspace(x[0], x[-1], x.size)

    # Build evenly-spaced y-axis
    return np.interp(x_even, x, y)


def serialize(value, *, dtype=DamnitType.STRING):  # noqa: C901
    if value is None:
        return value, dtype

    match dtype:
        case DamnitType.IMAGE:
            value = b64image(value)

        case DamnitType.TIMESTAMP:
            if isinstance(value, datetime):
                value = int(value.timestamp())
            else:
                value = int(value * 1000)

        case DamnitType.NUMBER:
            if not np.isfinite(value):
                value = to_javascript_string(value)

        case DamnitType.NUMPY:
            arr = blob2numpy(value)
            value = f"{arr.dtype}: {arr.shape}"
            dtype = DamnitType.STRING

        case DamnitType.COMPLEX:
            value = to_complex_string(blob2complex(value))
            dtype = DamnitType.STRING

        case DamnitType.ARRAY:
            if isinstance(value, bytes):
                arr = blob2numpy(value)

                # Validate/prepare data
                if arr.ndim != 2 or arr.shape[0] != 2:
                    # Unsupported shape
                    value = f"{arr.dtype}: {arr.shape}"
                    dtype = DamnitType.STRING
                else:
                    value = resample_array(arr)

    return value, dtype


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
