from abc import ABCMeta
from base64 import b64encode
from types import UnionType
from typing import Any, ClassVar, Union, get_args, get_origin

import numpy as np

from .shared.const import DamnitType

DEFAULT_ARRAY_NAME = "__xarray_dataarray_variable__"


DTYPE_MAP = {
    "bytes": DamnitType.IMAGE,
    "str": DamnitType.STRING,
    "bool_": DamnitType.BOOLEAN,
}


def map_dtype(dtype, default=DamnitType.STRING):
    dtype = DTYPE_MAP.get(dtype.__name__)
    if not dtype:
        dtype = DamnitType.NUMBER if np.issubdtype(dtype, np.number) else default
    return dtype


# -----------------------------------------------------------------------------
# Conversion


def b64image(bytes_):
    return f"data:image/png;base64,{b64encode(bytes_).decode('utf-8')}"


# -----------------------------------------------------------------------------
# Metaclasses


class Singleton(ABCMeta):
    _instances: ClassVar[dict[type, Any]] = {}

    def __call__(cls, *args, **kwargs):
        instance = cls._instances.get(cls)
        if not instance:
            instance = super(type(cls), cls).__call__(*args, **kwargs)
            cls._instances[cls] = instance
        return instance


class Registry(ABCMeta):
    def __call__(cls, proposal, *args, **kwargs):
        instance = (
            cls.registry.get(  # FIX: # pyright: ignore[reportAttributeAccessIssue]
                proposal
            )
        )
        if instance is None:
            instance = super().__call__(proposal, *args, **kwargs)
            cls.registry[  # FIX: # pyright: ignore[reportAttributeAccessIssue]
                proposal
            ] = instance
        return instance

    def __new__(cls, name, bases, attrs):
        new_class = super().__new__(cls, name, bases, attrs)
        new_class.registry = {}  # FIX: # pyright: ignore[reportAttributeAccessIssue]
        return new_class


# -----------------------------------------------------------------------------
# Etc.


def create_map(
    lst,
    *,
    key,
):
    return {obj[key]: {str(k): v for k, v in obj.items()} for obj in lst}


def get_type(type_):
    if get_origin(type_) in {Union, UnionType}:
        # Optional type hint
        return get_args(type_)[0]

    return type_
