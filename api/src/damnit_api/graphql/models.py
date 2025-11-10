import inspect
from datetime import UTC, datetime
from typing import (
    Generic,
    NewType,
    Optional,
    TypeVar,
)

import numpy as np
import strawberry

from ..const import DEFAULT_PROPOSAL, DamnitType
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
    NewType("Any", object),
)


Timestamp = strawberry.scalar(
    int | float,
    parse_value=lambda value: value / 1000,
    name="Timestamp",
)


@strawberry.interface
class BaseVariable:
    name: str
    dtype: str


@strawberry.type
class KnownVariable(Generic[T], BaseVariable):
    value: T


@strawberry.type
class DamnitVariable(BaseVariable):
    value: Any | None


@strawberry.interface
class DamnitRun:
    proposal: KnownVariable[int]
    run: KnownVariable[int]
    start_time: KnownVariable[Timestamp] | None
    added_at: KnownVariable[Timestamp] | None

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
        new_variables = {**self.variables, **variables}
        has_changed = self.variables != new_variables
        if has_changed:
            self.variables = new_variables
            self.stype = self._create_stype()

        if timestamp is not None:
            self.timestamp = timestamp

        return has_changed

    def as_stype(self, **fields):
        """Converts the database entry to Damnit type"""
        return self.stype.from_db(fields)

    def _create_stype(self) -> type[DamnitRun]:
        # Map annotations as (dynamic) DAMNIT variable
        annotations = {
            name: DamnitRun.known_annotations().get(
                name,
                Optional[DamnitVariable],  # noqa: UP007
            )
            for name in self.variables
        }

        # Create class
        new_class = type(
            f"p{self.proposal}", (DamnitRun,), {"__annotations__": annotations}
        )
        return strawberry.type(new_class)

    def resolve(self, **fields):
        return self.stype.resolve(fields)


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
