import os.path as osp
from abc import ABCMeta
from base64 import b64encode
from glob import iglob

import h5py
import numpy as np
from scipy.ndimage import zoom

from .const import Type

DEFAULT_ARRAY_NAME = "__xarray_dataarray_variable__"


DTYPE_MAP = {
    "bytes": Type.IMAGE,
    "str": Type.STRING,
    "bool_": Type.BOOLEAN,
}


def map_dtype(dtype, default=Type.STRING):
    dtype = DTYPE_MAP.get(dtype.__name__)
    if not dtype:
        dtype = Type.NUMBER if np.issubdtype(dtype, np.number) else default
    return dtype


# -----------------------------------------------------------------------------
# Conversion


def b64image(bytes_):
    return b64encode(bytes_).decode("utf-8")


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
    for d in iglob(osp.join(DATA_ROOT_DIR, "*/*/{}".format(propno))):
        return d

    return ""


def get_run_data(path, variable):
    try:
        with h5py.File(path) as file:
            group = file[variable]
            dataset = {
                key if key != DEFAULT_ARRAY_NAME else "data": group[key][:]
                for key in group.keys()
            }
    except FileNotFoundError as e:
        # TODO: manage the error XD
        raise e

    # Correct the data
    primary_name = next(iter(dataset))
    primary_data = dataset[primary_name]
    if primary_data.ndim == 1:
        # Most likely a vector
        if len(dataset) == 1:
            dataset["index"] = np.arange(primary_data.size)
        valid_index = np.isfinite(primary_data)
        for key in dataset:
            dataset[key] = dataset[key][valid_index]
    elif primary_data.ndim == 2:
        # Most likely a 2D image
        dataset[primary_name] = downsample_image(primary_data)

    return dataset


# -----------------------------------------------------------------------------
# Metaclasses


class Singleton(ABCMeta):
    _instances = {}

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


def create_map(lst, *, key):
    return {str(obj[key]): {str(k): v for k, v in obj.items()} for obj in lst}


def downsample_image(image, order=2):
    DIMENSION_DOWNSAMPLE = [
        (500, 1.5),
        (1000, 2),
    ]  # [(dimension, min downsample)]

    Ny, Nx = image.shape
    x_min_ds, y_min_ds = (1, 1)
    for dim, min_ds in DIMENSION_DOWNSAMPLE:
        if Nx > dim:
            x_min_ds = min_ds
        if Ny > dim:
            y_min_ds = min_ds

    if (x_min_ds, y_min_ds) != (1, 1):
        image = zoom(image, [1 / x_min_ds, 1 / y_min_ds], order=order)

    return image
