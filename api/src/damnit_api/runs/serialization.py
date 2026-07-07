from datetime import datetime

import numpy as np
from damnit.api import blob2complex

from ..shared.const import DamnitType
from ..utils import b64image, blob2numpy


def to_javascript_string(value):
    if np.isnan(value):
        return "NaN"
    if value == np.inf:
        return "Infinity"
    if value == -np.inf:
        return "-Infinity"

    return str(value)


def to_complex_string(z, symbol="j"):
    real = z.real
    imag = z.imag

    def fmt(x):
        if isinstance(x, float) and x.is_integer():
            return str(int(x))
        if not np.isfinite(x):
            return str(x)
        decimal = int(-np.floor(np.log10(abs(x))))
        precision = decimal + 2 if decimal >= 0 else 1
        return str(round(x, precision))

    if imag == 0:
        return fmt(real)

    abs_imag = abs(imag)
    imag_part = symbol if abs_imag == 1 else f"{fmt(abs_imag)}{symbol}"

    if real == 0:
        return f"-{imag_part}" if imag < 0 else imag_part

    sign = "+" if imag >= 0 else "-"
    return f"{fmt(real)}{sign}{imag_part}"


def resample_array(arr):
    # Cast arrays to float (same as PyQt implementation)
    x = np.asarray(arr[0], dtype=np.float64)
    y = np.asarray(arr[1], dtype=np.float64)

    # Drop not finite values (same as PyQt implementation)
    finite = np.isfinite(x) & np.isfinite(y)
    x = x[finite]
    y = y[finite]

    # Order by x-axis
    order = np.argsort(x)
    x = x[order]
    y = y[order]

    # Remove duplicates, just in case
    x, unique_idx = np.unique(x, return_index=True)
    y = y[unique_idx]

    # Return immediately if there's only less than 2 elements
    if x.size < 2:
        return y

    # Build evenly-spaced x-axis (maybe using `size` is not the best)
    x_even = np.linspace(x[0], x[-1], x.size)

    # Build evenly-spaced y-axis
    return np.interp(x_even, x, y)


def serialize(value, *, dtype=DamnitType.STRING):  # noqa: C901
    if value is None:
        return value, dtype

    match dtype:
        case DamnitType.IMAGE:
            value = b64image(value)

        case DamnitType.TIMESTAMP:
            if isinstance(value, datetime):
                value = int(value.timestamp())
            else:
                value = int(value * 1000)

        case DamnitType.NUMBER:
            if not np.isfinite(value):
                value = to_javascript_string(value)

        case DamnitType.NUMPY:
            arr = blob2numpy(value)
            value = f"{arr.dtype}: {arr.shape}"
            dtype = DamnitType.STRING

        case DamnitType.COMPLEX:
            value = to_complex_string(blob2complex(value))
            dtype = DamnitType.STRING

        case DamnitType.ARRAY:
            if isinstance(value, bytes):
                arr = blob2numpy(value)

                # Validate/prepare data
                if arr.ndim != 2 or arr.shape[0] != 2:
                    # Unsupported shape
                    value = f"{arr.dtype}: {arr.shape}"
                    dtype = DamnitType.STRING
                else:
                    value = resample_array(arr)

    return value, dtype
