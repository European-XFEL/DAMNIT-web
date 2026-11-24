from datetime import datetime

import numpy as np
from damnit.api import blob2complex, blob2numpy

from ..shared.const import DamnitType
from ..utils import b64image


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


def finite_points(arr):
    """The finite points of a 2xN trend as x and y arrays, sorted by x."""
    x = np.asarray(arr[0], dtype=np.float64)
    y = np.asarray(arr[1], dtype=np.float64)

    finite = np.isfinite(x) & np.isfinite(y)
    x = x[finite]
    y = y[finite]

    # Stable, so two samples at one x keep the order DAMNIT stored them in.
    order = np.argsort(x, kind="stable")
    return x[order], y[order]


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

        case DamnitType.ARRAY_1D:
            # Trendline summaries are stored as a 2xN array of x and y rows. We
            # send both so the frontend can show x in the hover tooltip.
            if isinstance(value, bytes):
                arr = blob2numpy(value)

                # Validate/prepare data
                if arr.ndim != 2 or arr.shape[0] != 2:
                    # Unsupported shape
                    value = f"{arr.dtype}: {arr.shape}"
                    dtype = DamnitType.STRING
                else:
                    x, y = finite_points(arr)
                    value = {"x": x, "y": y}

    return value, dtype
