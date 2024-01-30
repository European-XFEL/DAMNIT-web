from datetime import datetime, timezone
import inspect
from typing import (
    Dict, Generic, NewType, Optional, Type, TypeVar, Union,
    get_args, get_origin)

import numpy as np
import strawberry

from ..const import DEFAULT_PROPOSAL, Type as DamnitType
from ..utils import Registry, b64image, map_dtype


T = TypeVar("T")


def serialize(value, *, dtype=DamnitType.STRING):
    if dtype is DamnitType.IMAGE:
        value = b64image(value)
    elif dtype is DamnitType.TIMESTAMP:
        value = int(value.timestamp() if isinstance(value, datetime)
                    else value * 1000)

    return value


Any = strawberry.scalar(
    NewType("Any", object),
)


Timestamp = strawberry.scalar(
    Union[int, float],
    serialize=lambda value: serialize(value, dtype=DamnitType.TIMESTAMP),
    parse_value=lambda value: value / 1000,
    name='Timestamp'
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
        return cls(name=entry['name'], value=entry['value'])


@strawberry.type
class DamnitVariable(BaseVariable):
    value: Optional[Any]
    metadata: Optional[DamnitMetaData] = strawberry.field(default=strawberry.UNSET)

    @classmethod
    def from_db(cls, entry):
        dtype = map_dtype(type(entry['value']))
        value = serialize(entry['value'], dtype=dtype)

        # Database v0
        return cls(name=entry['name'], value=value, dtype=dtype)

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
        # Database v0
        variables = {name: klass.from_db({'name': name, 'value': entry[name]})
                     for name, klass in cls.__annotations__.items()}

        # # Database v1
        # pass

        return cls(**variables)

    @classmethod
    def known_dtypes(cls):
        dtypes = {}
        for name, annotation in cls.__annotations__.items():
            type_ = annotation.__args__[0]
            dtype = (map_dtype(type_) if inspect.isclass(type_) else
                     DamnitType(type_._scalar_definition.name.lower()))

            dtypes[name] = dtype
        return dtypes

    @classmethod
    def known_annotations(cls):
        return cls.__annotations__


class DamnitTable(metaclass=Registry):
    proposal = ''
    path = ''  # TODO: handle dynamic database path
    schema = {}  # dict of {prop: type}, used by the frontend
    stype = None  # strawberry type
    timestamp = datetime.now().timestamp()  # timestamp of the latest model
    num_rows = 0

    def __init__(self, proposal: str = DEFAULT_PROPOSAL):
        self.proposal = proposal
        self.dtypes = {**DamnitRun.known_dtypes()}
        self.update()

    def update(self,
               dtypes: Union[Dict[str, DamnitType], None] = None,
               timestamp: Union[float, None] = None):
        """We update the strawberry type and the schema here"""
        if dtypes is not None:
            self.dtypes.update(dtypes)

        self.stype = self._create_stype()
        self.schema = self._create_schema()
        if timestamp is not None:
            self.timestamp = timestamp

    def as_dict(self, **fields):
        schema = self.schema
        return {name: serialize(value, dtype=DamnitType(schema[name]['dtype']))
                for name, value in fields.items()}

    def as_stype(self, **fields):
        """Converts the database entry to Damnit type"""
        # TODO: Handle missing variables
        return self.stype.from_db(fields)

    @property
    def variables(self):
        return list(self.schema.keys())

    def _create_stype(self) -> Type[DamnitRun]:
        # Map annotations as (dynamic) DAMNIT variable
        annotations = {
            name: DamnitRun.known_annotations().get(name, DamnitVariable)
            for name in self.dtypes}

        # Create class
        new_class = type(f"p{self.proposal}",
                         (DamnitRun,),
                         {"__annotations__": annotations})
        return strawberry.type(new_class)

    def _create_schema(self) -> dict:
        # TODO: Replace annnotations with mapped schema
        schema = {}
        for name, dtype in self.dtypes.items():
            schema[name] = {
                'id': name,
                'dtype': dtype.value}

        # REMOVEME: Redefine variables with known data types
        known_dtypes = {
            'sample_flow_rate_meas': DamnitType.ARRAY,
        }
        for name, dtype in known_dtypes.items():
            if sch := schema.get(name):
                sch['dtype'] = dtype.value

        return schema

    @staticmethod
    def _map_dtype(dtype, default=DamnitType.STRING):
        # TODO: Deprecate and use type enums from database entries
        DTYPE_MAP = {
            bytes: DamnitType.IMAGE,
            str: DamnitType.STRING,
            bool: DamnitType.BOOLEAN,
            type(None): default,
        }

        origin = get_origin(dtype)
        if origin is Union:
            # Optional type hint
            dtype = get_args(dtype)[0]
        if not inspect.isclass(dtype):
            # Strawberry scalar object
            return DamnitType(dtype._scalar_definition.name.lower())

        mapped = DTYPE_MAP.get(dtype)
        if not mapped:
            mapped = (DamnitType.NUMBER if np.issubdtype(dtype, np.number)
                      else default)
        return mapped


def get_model(proposal: str):
    return DamnitTable(proposal)


def update_model(proposal: str,
                 dtypes: dict,
                 timestamp: Union[float, None] = None,
                 num_rows: int = 0):
    model = DamnitTable(proposal)
    model.update(dtypes, timestamp)
    model.num_rows = num_rows
    return model


def get_stype(proposal: str):
    model = DamnitTable(proposal)
    return model.stype
