from datetime import datetime
from typing import (
    Generic,
    NewType,
    Optional,
    Type,
    TypeVar,
    Union,
)

import strawberry

from ..const import DEFAULT_PROPOSAL, Type as DamnitType
from ..utils import Registry, b64image, map_dtype


T = TypeVar("T")


def serialize(value, *, dtype=DamnitType.STRING):
    if dtype is DamnitType.IMAGE:
        value = b64image(value)
    elif dtype is DamnitType.TIMESTAMP:
        value = int(
            value.timestamp() if isinstance(value, datetime) else value * 1000
        )

    return value


Any = strawberry.scalar(
    NewType("Any", object),
)


Timestamp = strawberry.scalar(
    Union[int, float],
    serialize=lambda value: serialize(value, dtype=DamnitType.TIMESTAMP),
    parse_value=lambda value: value / 1000,
    name="Timestamp",
)


@strawberry.type
class DamnitMetaData:
    timestamp: Timestamp
    version: int


@strawberry.interface
class BaseVariable:
    name: str
    dtype: str

    @classmethod
    def from_db(cls, entry):
        raise NotImplementedError("Needs to be subclassed.")


@strawberry.type
class KnownVariable(Generic[T], BaseVariable):
    value: T

    @strawberry.field
    def dtype(self) -> str:
        return map_dtype(type(self.value)).value

    @classmethod
    def from_db(cls, entry):
        return cls(name=entry["name"], value=entry["value"])


@strawberry.type
class DamnitVariable(BaseVariable):
    value: Optional[Any]
    metadata: Optional[DamnitMetaData] = strawberry.field(
        default=strawberry.UNSET
    )

    @classmethod
    def from_db(cls, entry):
        dtype = map_dtype(type(entry["value"]))
        value = serialize(entry["value"], dtype=dtype)

        # Database v0
        return cls(name=entry["name"], value=value, dtype=dtype)

        # # Database v1
        # meta = DamnitMetaData(timestamp=entry.timestamp,
        #                       version=entry.version,
        #                       dtype=dtype or map_dtype(entry.value))

        # return cls(name=entry.name, value=entry.value, metadata=meta)


@strawberry.interface
class DamnitRun:

    proposal: KnownVariable[int]
    run: KnownVariable[int]
    start_time: KnownVariable[Timestamp]
    added_at: KnownVariable[Timestamp]

    @classmethod
    def from_db(cls, entry):
        variables = {
            name: klass.from_db({"name": name, "value": entry[name]})
            for name, klass in cls.__annotations__.items()
        }

        return cls(**variables)

    @classmethod
    def known_variables(cls):
        dtypes = {}
        for name in cls.__annotations__:
            dtypes[name] = None
        return dtypes

    @classmethod
    def known_annotations(cls):
        return cls.__annotations__


class DamnitTable(metaclass=Registry):
    proposal = ""
    path = ""  # TODO: handle dynamic database path
    stype = None  # strawberry type
    timestamp = datetime.now().timestamp()  # timestamp of the latest model
    num_rows = 0

    def __init__(self, proposal: str = DEFAULT_PROPOSAL):
        self.proposal = proposal
        self.variables = DamnitRun.known_variables()
        self.update()

    def update(self, variables=None, timestamp: Union[float, None] = None):
        """We update the strawberry type and the schema here"""
        if variables is not None:
            self.variables = {**self.variables, **variables}

        self.stype = self._create_stype()
        if timestamp is not None:
            self.timestamp = timestamp

    def as_stype(self, **fields):
        """Converts the database entry to Damnit type"""
        # TODO: Handle missing variables
        return self.stype.from_db(fields)

    def _create_stype(self) -> Type[DamnitRun]:
        # Map annotations as (dynamic) DAMNIT variable
        annotations = {
            name: DamnitRun.known_annotations().get(name, DamnitVariable)
            for name in self.variables
        }

        # Create class
        new_class = type(
            f"p{self.proposal}", (DamnitRun,), {"__annotations__": annotations}
        )
        return strawberry.type(new_class)


def get_model(proposal: str):
    return DamnitTable(proposal)


def update_model(
    proposal: str,
    dtypes: dict,
    timestamp: Union[float, None] = None,
    num_rows: int = 0,
):
    model = DamnitTable(proposal)
    model.update(dtypes, timestamp)
    model.num_rows = num_rows
    return model


def get_stype(proposal: str):
    model = DamnitTable(proposal)
    return model.stype
