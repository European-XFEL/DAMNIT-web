import inspect
from datetime import UTC, datetime
from typing import Generic, NewType, TypeVar

import numpy as np
import strawberry
from damnit.api import blob2complex, blob2numpy

from ..shared.const import DEFAULT_PROPOSAL, DamnitType
from ..utils import (
    Registry,
    b64image,
    create_map,
    get_type,
    python_type_to_damnit_type,
    summary_type_to_damnit_type,
)

T = TypeVar("T")


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


Any = strawberry.scalar(
    NewType(
        "Any", object
    ),  # FIX: # pyright: ignore[reportArgumentType, reportCallIssue]
)  # pyright: ignore[reportCallIssue]


Timestamp = strawberry.scalar(
    int | float,  # FIX: # pyright: ignore[reportArgumentType]
    parse_value=lambda value: value / 1000,
    name="Timestamp",
)


@strawberry.interface
class BaseVariable:
    name: str
    dtype: str


@strawberry.type
class KnownVariable(Generic[T], BaseVariable):  # FIX: # noqa: UP046
    value: T


@strawberry.type
class DamnitVariable(BaseVariable):
    value: Any | None  # FIX: # pyright: ignore[reportInvalidTypeForm]


@strawberry.interface
class DamnitRun:
    proposal: KnownVariable[int]
    run: KnownVariable[int]
    start_time: KnownVariable[Timestamp] | None  # pyright: ignore[reportInvalidTypeForm] # FIX:
    added_at: KnownVariable[Timestamp] | None  # pyright: ignore[reportInvalidTypeForm] # FIX:

    @classmethod
    def from_db(cls, record):
        return cls(**cls.resolve(record, as_dict=False))

    @classmethod
    def resolve(cls, record, as_dict=True):
        variables = {}
        for name, klass in cls.__annotations__.items():
            if name not in record:
                variables[name] = None
                continue

            klass = get_type(klass)
            dtype = cls.get_dtype(entry=record[name], klass=klass)
            value, dtype = serialize(record[name]["value"], dtype=dtype)

            if value is None:
                result = None
            elif as_dict:
                result = {"value": value, "dtype": dtype.value}
            else:
                result = klass(name=name, value=value, dtype=dtype.value)

            variables[name] = result

        return variables

    @classmethod
    def known_variables(cls):
        # TODO: Make this more streamlined
        return create_map(
            [
                {
                    "name": "proposal",
                    "title": "Proposal",
                    "tags": [],
                },
                {
                    "name": "run",
                    "title": "Run",
                    "tags": [],
                },
                {
                    "name": "start_time",
                    "title": "Timestamp",
                    "tags": [],
                },
                {
                    "name": "added_at",
                    "title": "Added at",
                    "tags": [],
                },
            ],
            key="name",
        )

    @classmethod
    def known_annotations(cls):
        return cls.__annotations__

    @staticmethod
    def get_dtype(entry, klass=None):
        if klass is not None and hasattr(klass, "__args__"):
            type_ = klass.__args__[0]
            return (
                python_type_to_damnit_type(type_)
                if inspect.isclass(type_)
                else DamnitType(type_._scalar_definition.name.lower())
            )

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


class DamnitTable(metaclass=Registry):
    proposal = ""
    path = ""  # TODO: handle dynamic database path
    stype = None  # strawberry type

    # timestamp of the latest model
    timestamp = datetime.now(tz=UTC).timestamp()

    def __init__(self, proposal: str = DEFAULT_PROPOSAL):
        self.proposal = proposal
        self.variables = DamnitRun.known_variables()
        self.stype = self._create_stype()
        self.runs = []
        self.tags = {}

    def update(self, variables=None, timestamp: float | None = None):
        """We update the strawberry type and the schema here"""
        new_variables = {**self.variables, **variables}  # pyright: ignore[reportGeneralTypeIssues] # FIX:
        has_changed = self.variables != new_variables
        if has_changed:
            self.variables = new_variables
            self.stype = self._create_stype()

        if timestamp is not None:
            self.timestamp = timestamp

        return has_changed

    def as_stype(self, **fields):
        """Converts the database record to Damnit type"""
        return self.stype.from_db(fields)  # pyright: ignore[reportOptionalMemberAccess] # FIX:

    def _create_stype(self) -> type[DamnitRun]:
        # Map annotations as (dynamic) DAMNIT variable
        annotations = {
            name: DamnitRun.known_annotations().get(
                name,
                DamnitVariable | None,
            )
            for name in self.variables
        }

        # Create class
        new_class = type(
            f"p{self.proposal}", (DamnitRun,), {"__annotations__": annotations}
        )
        return strawberry.type(new_class)

    def resolve(self, **fields):
        return self.stype.resolve(fields)  # pyright: ignore[reportOptionalMemberAccess] # FIX:


def get_model(proposal: str):
    return DamnitTable(proposal)


def update_model(
    proposal: str,
    variables: dict,
    timestamp: float | None = None,
):
    model = DamnitTable(proposal)
    model.update(variables, timestamp)
    return model


def get_stype(proposal: str):
    model = DamnitTable(proposal)
    return model.stype
