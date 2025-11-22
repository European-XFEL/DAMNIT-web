import inspect
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import (
    Generic,
    NewType,
    TypeVar,
)

import numpy as np
import strawberry

from ..shared.const import DamnitType
from ..utils import Registry, b64image, create_map, get_type, map_dtype

T = TypeVar("T")


def to_js_string(value):
    if np.isnan(value):
        return "NaN"
    if value == np.inf:
        return "Infinity"
    if value == -np.inf:
        return "-Infinity"

    return str(value)


def serialize(value, *, dtype=DamnitType.STRING):
    if value is None:
        return value

    if dtype is DamnitType.IMAGE:
        value = b64image(value)
    elif dtype is DamnitType.TIMESTAMP:
        value = int(value.timestamp() if isinstance(value, datetime) else value * 1000)
    elif dtype is DamnitType.NUMBER and not np.isfinite(value):
        value = to_js_string(value)

    return value


Any = strawberry.scalar(
    NewType("Any", object),  # FIX: # pyright: ignore[reportArgumentType]
)


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
    def from_db(cls, entry):
        return cls(**cls.resolve(entry, as_dict=False))

    @classmethod
    def resolve(cls, entry, as_dict=True):
        variables = {}
        for name, klass in cls.__annotations__.items():
            if name not in entry:
                variables[name] = None
                continue

            klass = get_type(klass)
            dtype = cls.get_dtype(value=entry[name], klass=klass)
            value = serialize(entry[name], dtype=dtype)

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
                    "tag_ids": [],
                },
                {
                    "name": "run",
                    "title": "Run",
                    "tag_ids": [],
                },
                {
                    "name": "start_time",
                    "title": "Timestamp",
                    "tag_ids": [],
                },
                {
                    "name": "added_at",
                    "title": "Added at",
                    "tag_ids": [],
                },
            ],
            key="name",
        )

    @classmethod
    def known_annotations(cls):
        return cls.__annotations__

    @staticmethod
    def get_dtype(value, klass=None):
        if klass is not None and hasattr(klass, "__args__"):
            type_ = klass.__args__[0]
            dtype = (
                map_dtype(type_)
                if inspect.isclass(type_)
                else DamnitType(type_._scalar_definition.name.lower())
            )
        else:
            dtype = map_dtype(type(value))
        return dtype


class DamnitTable(metaclass=Registry):
    stype = None  # strawberry type

    # timestamp of the latest model
    timestamp = datetime.now(tz=UTC).timestamp()

    @staticmethod
    def _name_fallback(db_path: Path) -> str:
        """Fallback to extract proposal name from path, assuming db_path is in proposal
        dir"""

        name_match = re.search(r"(?:^|/)(p\d{6})(?:/|$)", str(db_path))
        if name_match:
            return name_match.group(1)

        return str(db_path)

    def __init__(self, db_path: Path, name: str | None = None):
        self.name = name or self._name_fallback(db_path)
        self.db_path = db_path
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
        """Converts the database entry to Damnit type"""
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
        new_class = type(f"{self.name}", (DamnitRun,), {"__annotations__": annotations})
        return strawberry.type(new_class)

    def resolve(self, **fields):
        return self.stype.resolve(fields)  # pyright: ignore[reportOptionalMemberAccess] # FIX:


def get_model(db_path: Path):
    return DamnitTable(db_path)


def update_model(
    db_path: Path,
    variables: dict,
    timestamp: float | None = None,
):
    model = DamnitTable(db_path)
    model.update(variables, timestamp)
    return model


def get_stype(db_path: Path):
    model = DamnitTable(db_path)
    return model.stype
