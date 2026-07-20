import io
import os.path as osp
from base64 import b64encode
from glob import iglob
from types import UnionType
from typing import Union, get_args, get_origin

import numpy as np

from .shared.const import DamnitType
from .shared.models import ProposalNumber

DEFAULT_ARRAY_NAME = "__xarray_dataarray_variable__"


PYTHON_TYPES = {
    "bytes": DamnitType.IMAGE,
    "str": DamnitType.STRING,
    "bool_": DamnitType.BOOLEAN,
}

SUMMARY_TYPES = {
    "complex": DamnitType.COMPLEX,
    "numpy": DamnitType.NUMPY,
    "trendline": DamnitType.ARRAY,
}


def python_type_to_damnit_type(type_):
    dtype = PYTHON_TYPES.get(type_.__name__)
    if not dtype and np.issubdtype(type_, np.number):
        dtype = DamnitType.NUMBER
    return dtype


def summary_type_to_damnit_type(type_):
    return SUMMARY_TYPES.get(type_)


# -----------------------------------------------------------------------------
# Conversion


def b64image(bytes_):
    return f"data:image/png;base64,{b64encode(bytes_).decode('utf-8')}"


# TODO: Remove this and import directly after upgrading to DAMNIT>=0.2.2.
def blob2numpy(data: bytes) -> np.ndarray:
    """Deserialize .npy bytes from SQLite into a numpy array."""
    buff = io.BytesIO(data)
    return np.load(buff, allow_pickle=False)


# -----------------------------------------------------------------------------
# Proposal and runs

DATA_ROOT_DIR = "/gpfs/exfel/exp"


def find_proposal(proposal: ProposalNumber) -> str:
    """Find the proposal directory for a given proposal on Maxwell.

    Lifted and modified from extra_data.read_machinery.py
    https://github.com/European-XFEL/EXtra-data/blob/master/extra_data/read_machinery.py
    """
    for d in iglob(osp.join(DATA_ROOT_DIR, f"*/*/{proposal}")):  # noqa: PTH118, PTH207
        return d

    return ""


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
