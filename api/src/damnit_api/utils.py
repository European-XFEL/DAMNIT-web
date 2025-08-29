import os.path as osp
from abc import ABCMeta
from base64 import b64encode
from glob import iglob
from typing import Any, ClassVar, Union, get_args, get_origin

import numpy as np

from .const import DamnitType

DEFAULT_ARRAY_NAME = "__xarray_dataarray_variable__"


DTYPE_MAP = {
    "bytes": DamnitType.IMAGE,
    "str": DamnitType.STRING,
    "bool_": DamnitType.BOOLEAN,
}


def map_dtype(dtype, default=DamnitType.STRING):
    dtype = DTYPE_MAP.get(dtype.__name__)
    if not dtype:
        dtype = (
            DamnitType.NUMBER if np.issubdtype(dtype, np.number) else default
        )
    return dtype


# -----------------------------------------------------------------------------
# Conversion


def b64image(bytes_):
    return f"data:image/png;base64,{b64encode(bytes_).decode('utf-8')}"


# -----------------------------------------------------------------------------
# Proposal and runs

DATA_ROOT_DIR = "/gpfs/exfel/exp"


def format_proposal_number(proposal):
    """Format a given unformatted proposal number."

    Lifted and modified from extra_data.reader.py
    https://github.com/European-XFEL/EXtra-data/blob/master/extra_data/reader.py
    """
    if not proposal.startswith("p"):
        proposal = "p" + proposal.rjust(6, "0")

    return proposal


def find_proposal(propno):
    """Find the proposal directory for a given proposal on Maxwell

    Lifted and modified from extra_data.read_machinery.py
    https://github.com/European-XFEL/EXtra-data/blob/master/extra_data/read_machinery.py
    """

    if "/" in propno:
        # Already passed a proposal directory
        return propno

    propno = format_proposal_number(propno)
    for d in iglob(osp.join(DATA_ROOT_DIR, f"*/*/{propno}")):  # noqa: PTH118, PTH207
        return d

    return ""


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
        instance = cls.registry.get(proposal)
        if instance is None:
            instance = super().__call__(proposal, *args, **kwargs)
            cls.registry[proposal] = instance
        return instance

    def __new__(cls, name, bases, attrs):
        new_class = super().__new__(cls, name, bases, attrs)
        new_class.registry = {}
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
    if get_origin(type_) is Union:
        # Optional type hint
        return get_args(type_)[0]

    return type_
