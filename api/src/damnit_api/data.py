import io

import numpy as np
import xarray as xr
from damnit.api import Damnit, DataType
from PIL import Image

from .const import DamnitType
from .utils import b64image

NOT_SUPPORTED_MESSAGE = "Not supported."


def get_extracted_data(proposal, run, variable):
    try:
        var_data = Damnit(proposal)[run, variable]
    except KeyError:
        return standardize(None, name=variable, dtype=DamnitType.NONE.value)

    data = var_data.read()  # FIX: # pyright: ignore[reportAttributeAccessIssue]
    type_hint = (
        var_data.type_hint()  # FIX: # pyright: ignore[reportAttributeAccessIssue]
    )

    match type(data):
        case np.ndarray:
            # We need to squeeze the data first to get the right Damnit type
            # and to set the right dimension names
            data = data.squeeze()  # FIX: # pyright: ignore[reportAttributeAccessIssue]
        case xr.DataArray:
            data = data.squeeze(  # FIX: # pyright: ignore[reportAttributeAccessIssue]
                drop=True  # FIX: # pyright: ignore[reportCallIssue]
            )

    try:
        dtype = get_damnit_type(data, type_hint=type_hint)
    except ValueError:
        return standardize(None, name=variable, dtype=DamnitType.NONE.value)

    attrs = None
    match dtype:
        case DamnitType.ARRAY | DamnitType.IMAGE:
            data = get_array(data)
        case DamnitType.RGBA:
            attrs = {
                "shape": list(
                    data.shape[:2]  # FIX: # pyright: ignore[reportAttributeAccessIssue]
                )
            }
            data = get_png(data)
            dtype = DamnitType.PNG

    return standardize(data, name=variable, dtype=dtype.value, attrs=attrs)


def get_png(data):
    image_obj = Image.fromarray(data)

    with io.BytesIO() as buffer:
        image_obj.save(buffer, format="PNG")
        return b64image(buffer.getvalue())


def get_array(data):
    array = to_dataarray(data)
    array = downsample(array)

    return with_attributes(array)


# -----------------------------------------------------------------
# Types


def get_damnit_type(data, *, type_hint=None):  # noqa: C901
    match type_hint:
        case DataType.Image:
            return DamnitType.RGBA
        case DataType.Timestamp:
            return DamnitType.TIMESTAMP
        case None:
            if np.isscalar(data):
                if isinstance(data, str):
                    return DamnitType.STRING
                if isinstance(data, bool):
                    return DamnitType.BOOLEAN
                if isinstance(data, int | float | np.integer | np.floating):
                    return DamnitType.NUMBER
                raise ValueError(NOT_SUPPORTED_MESSAGE)
        case DataType.Dataset | DataType.PlotlyFigure:
            raise ValueError(NOT_SUPPORTED_MESSAGE)

    if not isinstance(data, xr.DataArray | np.ndarray):
        raise ValueError(NOT_SUPPORTED_MESSAGE)

    match data.ndim:
        case 1:
            return DamnitType.ARRAY
        case 2:
            return DamnitType.IMAGE
        case _:
            raise ValueError(NOT_SUPPORTED_MESSAGE)


# -----------------------------------------------------------------
# DataArray


def to_dataarray(array):
    match type(array):
        case np.ndarray:
            array = xr.DataArray(array)
        case xr.DataArray:
            pass  # Already in the desired data type
        case _:
            raise ValueError(NOT_SUPPORTED_MESSAGE)

    array = rename_dims(array)
    return fill_coords(array)


def rename_dims(array):
    match array.ndim:
        case 1:
            dims = ["index"]
        case 2:
            dims = ["y", "x"]
        case _:
            raise ValueError(NOT_SUPPORTED_MESSAGE)

    renamed = {dim: dims[i] for i, dim in enumerate(array.dims) if dim == f"dim_{i}"}
    if renamed:
        array = array.rename(renamed)
    return array


def fill_coords(array):
    missing = {
        dim: np.arange(array.sizes[dim])
        for dim in array.dims
        if dim not in array.coords
    }

    if missing:
        array = array.assign_coords(**missing)

    return array


def downsample(
    data_array,
    *,
    max_bins_1d: int = 10_000,
    max_bins_2d: int = 1_000,
    min_ratio_2d: float = 0.05,
):
    match data_array.ndim:
        case 1:
            bins = [min(max_bins_1d, data_array.size)]

            # Skip downsampling if the size is small
            if bins[0] == data_array.size:
                return data_array
        case 2:
            Ny, Nx = data_array.shape  # noqa: N806

            # Skip downsampling if the sizes are small
            if max(Ny, Nx) <= max_bins_2d:
                return data_array

            # Skip downsampling if the ratio is small
            ratio = min(Ny, Nx) / max(Ny, Nx)
            if ratio < min_ratio_2d:
                return data_array

            denom = max(Nx, Ny)
            factor = max_bins_2d / denom
            bins = [max(1, int(Ny * factor)), max(1, int(Nx * factor))]
        case _:
            message = "Downsampling is only supported for 1D or 2D arrays"
            raise RuntimeError(message)

    coords = {
        d: np.linspace(
            np.nanmin(data_array.coords[d]),
            np.nanmax(data_array.coords[d]),
            num=b,
        )
        for d, b in zip(data_array.dims, bins, strict=True)
    }

    return data_array.interp(**coords, method="linear")


def with_attributes(array):
    match array.ndim:
        case 2:
            vmin = np.nanquantile(array, 0.01, method="nearest")
            vmax = np.nanquantile(array, 0.99, method="nearest")
            array.attrs["colormap_range"] = [vmin, vmax]

    array.attrs["shape"] = list(array.shape)

    return array


# -----------------------------------------------------------
# Standardization


def standardize(data, *, name="default", dtype=None, attrs=None):
    """This uses the xarray.DataArray format, with added dtype."""
    match type(data):
        case xr.DataArray:
            result = data.to_dict()
            result["coords"] = {
                dim: coord["data"] for dim, coord in result["coords"].items()
            }
        case _:
            result = {
                "data": data,
                "attrs": {},
            }

    if attrs:
        result["attrs"].update(attrs)

    if not result.get("name"):
        result["name"] = name

    if dtype is not None:
        result["dtype"] = dtype

    return result
