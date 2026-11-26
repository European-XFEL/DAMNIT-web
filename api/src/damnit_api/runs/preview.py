import io

import numpy as np
import xarray as xr
from damnit.api import Damnit, DataType
from PIL import Image

from ..shared.const import DamnitType
from ..utils import b64image
from .sqlite import get_damnit_path

NOT_SUPPORTED_MESSAGE = "Not supported."


def get_preview_data(proposal, run_id, variable):
    """Return the preview of one run's variable in `proposal`'s database.

    `run_id` is a `(proposal, run)` pair; a proposal of None reads the
    database's active proposal.
    """
    path = get_damnit_path(str(proposal))
    try:
        var_data = Damnit(path)[*run_id, variable]
    except KeyError:
        return standardize(None, name=variable, dtype=DamnitType.NONE.value)

    data = var_data.preview_data(data_fallback=False)
    if data is not None:
        type_hint = None
    else:
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

    # Masks come back as bool arrays, from read() as well, and plot as 0 and 1
    if isinstance(data, np.ndarray | xr.DataArray) and data.dtype == bool:
        data = data.astype(np.uint8)

    try:
        dtype = get_damnit_type(data, type_hint=type_hint)
    except ValueError:
        return standardize(None, name=variable, dtype=DamnitType.NONE.value)

    attrs = None
    match dtype:
        case DamnitType.ARRAY_1D | DamnitType.ARRAY_2D:
            data = get_array(data)
        case DamnitType.IMAGE:
            attrs = {
                "shape": list(
                    data.shape[:2]  # FIX: # pyright: ignore[reportAttributeAccessIssue]
                )
            }
            data = get_png(data)

    return standardize(data, name=variable, dtype=dtype.value, attrs=attrs)


def get_png(data):
    image_obj = Image.fromarray(np.asarray(data))

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
            if is_rgb(data):
                return DamnitType.IMAGE
            raise ValueError(NOT_SUPPORTED_MESSAGE)
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
            return DamnitType.ARRAY_1D
        case 2:
            return DamnitType.ARRAY_2D
        case 3 if type_hint is None and is_rgb(data):
            return DamnitType.IMAGE
        case _:
            raise ValueError(NOT_SUPPORTED_MESSAGE)


def is_rgb(data):
    """Return whether `data` is a uint8 RGB or RGBA array, (H, W, 3) or (H, W, 4).

    PIL writes only uint8 color arrays as PNG.
    """
    return (
        isinstance(data, xr.DataArray | np.ndarray)
        and data.ndim == 3
        and data.shape[-1] in (3, 4)
        and data.dtype == np.uint8
    )


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


def downsample(data_array, *, max_points_1d: int = 10_000, max_points_2d: int = 1_000):
    """Keep evenly spaced points on each axis longer than its cap.

    The points keep their own coordinates. A capped 1-D array also keeps its
    finite minimum and maximum, so it can hold up to two points past its cap.
    """
    match data_array.ndim:
        case 1:
            if data_array.size <= max_points_1d:
                return data_array

            picks = np.union1d(
                even_indices(data_array.size, max_points_1d),
                extreme_indices(data_array.values),
            )
            return data_array[picks]
        case 2:
            picked = data_array.isel({
                dim: even_indices(size, max_points_2d)
                for dim, size in data_array.sizes.items()
                if size > max_points_2d
            })

            # Plotly needs sorted heatmap axes, and isel keeps the order rows came in.
            # Sorting copies the array, so sort only the axes that need it.
            unsorted = [
                dim
                for dim in picked.dims
                if not picked.indexes[dim].is_monotonic_increasing
            ]
            return picked.sortby(unsorted) if unsorted else picked
        case _:
            message = "Downsampling is only supported for 1D or 2D arrays"
            raise RuntimeError(message)


def even_indices(size, count):
    """Return `count` evenly spaced indices from 0 to `size - 1`."""
    return np.linspace(0, size - 1, count).round().astype(int)


def extreme_indices(values):
    """Return the indices of the finite minimum and maximum, if there are any."""
    extremes = np.array([values.argmin(), values.argmax()])
    if np.isfinite(values[extremes]).all():
        return extremes

    # A NaN or an infinity took a pick. Only such a trace pays for a filtered copy.
    finite = np.where(np.isfinite(values), values, np.nan)
    try:
        return np.array([np.nanargmin(finite), np.nanargmax(finite)])
    except ValueError:  # no finite reading at all
        return np.array([], dtype=int)


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
