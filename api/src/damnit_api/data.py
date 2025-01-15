import io

import numpy as np
from PIL import Image
import xarray as xr

from damnit.api import Damnit, DataType

from .const import DamnitType
from .utils import b64image


def get_extracted_data(proposal, run, variable):
    var_data = Damnit(proposal)[run, variable]
    type_hint = var_data.type_hint()
    data = var_data.read()

    # REMOVEME
    if variable == "azimuthal_pump_diff_minus_ref":
        data = np.random.randint(0, 255, size=data.shape)

    dtype = get_damnit_type(data, type_hint=type_hint)
    attrs = None
    match type_hint:
        case DataType.DataArray | None:
            data = get_array(data)
        case DataType.Image:
            attrs = {"shape": list(data.shape[:2])}
            data = get_png(data)
            dtype = DamnitType.PNG
        case _:
            raise ValueError(f"Not supported: {type_hint}")

    return standardize(data, name=variable, dtype=dtype.value, attrs=attrs)


def get_png(data):
    image_obj = Image.fromarray(data)

    with io.BytesIO() as buffer:
        image_obj.save(buffer, format="PNG")
        image_str = b64image(buffer.getvalue())

    return image_str


def get_array(data):
    array = to_dataarray(data)
    array = downsample(array)

    return with_attributes(array)


# -----------------------------------------------------------------
# Types


def get_damnit_type(data, *, type_hint=None):
    match type_hint:
        case DataType.Image:
            return DamnitType.RGBA
        case DataType.Timestamp:
            return DamnitType.TIMESTAMP
        case None:
            if np.isscalar(data):
                if isinstance(data, str):
                    return DamnitType.STRING
                elif isinstance(data, bool):
                    return DamnitType.BOOLEAN
                elif isinstance(data, (int, float)):
                    return DamnitType.NUMBER
                else:
                    raise ValueError("Not supported.")
        case DataType.Dataset | DataType.PlotlyFigure:
            raise ValueError("Not supported.")

    if not isinstance(data, (xr.DataArray, np.ndarray)):
        raise ValueError("Not supported.")

    match data.ndim:
        case 1:
            return DamnitType.ARRAY
        case 2:
            return DamnitType.IMAGE
        case _:
            raise ValueError("Not supported.")


# -----------------------------------------------------------------
# DataArray


def to_dataarray(data):
    match type(data):
        case np.ndarray:
            # We need to squeeze the data first
            # to set the right dimension names
            array = xr.DataArray(data.squeeze())
        case xr.DataArray:
            array = data.squeeze(drop=True)
        case _:
            raise ValueError("Not supported")

    array = rename_dims(array)
    array = fill_coords(array)
    return array


def rename_dims(array):
    match array.ndim:
        case 1:
            dims = ["index"]
        case 2:
            dims = ["y", "x"]
        case _:
            raise ValueError("Not supported")

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
            Ny, Nx = data_array.shape

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
            raise RuntimeError("Downsampling is only supported for 1D or 2D arrays")

    coords = {
        d: np.linspace(
            np.nanmin(data_array.coords[d]), np.nanmax(data_array.coords[d]), num=b
        )
        for d, b in zip(data_array.dims, bins)
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
