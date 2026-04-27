from dataclasses import dataclass
from datetime import datetime
from typing import NewType

import numpy as np
import strawberry
from damnit.api import blob2complex

from ..shared.const import DamnitType
from ..utils import (
    b64image,
    blob2numpy,
    create_map,
    python_type_to_damnit_type,
    summary_type_to_damnit_type,
)


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


@strawberry.type
class DamnitVariable:
    name: str
    value: Any | None
    dtype: str


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
    def from_db(cls, record):
        variables = []
        for name, entry in record.items():
            if entry is None:
                continue
            dtype = cls.get_dtype(name, entry)
            value, dtype = serialize(entry["value"], dtype=dtype)
            variables.append(
                DamnitVariable(name=name, value=Any(value), dtype=dtype.value)
            )
        return cls(_variables=variables)

    @classmethod
    def resolve(cls, record, as_dict=True):
        if not as_dict:
            return cls.from_db(record)

        variables = {}
        for name, entry in record.items():
            if entry is None:
                variables[name] = None
                continue

            dtype = cls.get_dtype(name, entry)
            value, dtype = serialize(entry["value"], dtype=dtype)

            if value is None:
                variables[name] = None
            else:
                variables[name] = {"value": value, "dtype": dtype.value}

        return variables

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
