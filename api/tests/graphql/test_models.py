import io

import numpy as np
import pytest

from damnit_api.graphql.models import (
    resample_array,
    serialize,
    to_complex_string,
)
from damnit_api.shared.const import DamnitType


def to_npy_bytes(arr):
    buf = io.BytesIO()
    np.save(buf, arr)
    return buf.getvalue()


# -----------------------------------------------------------------------------
# Test to_complex_string


@pytest.mark.parametrize(
    ("z", "expected"),
    [
        (0 + 0j, "0"),
        (0 + 1j, "j"),
        (0 - 1j, "-j"),
        (1 + 1j, "1+j"),
        (2 - 3j, "2-3j"),
    ],
)
def test_complex_string_integer_parts(z, expected):
    assert to_complex_string(z) == expected


def test_complex_string_auto_precision():
    z = complex(-0.6420639145778715, 7.465583292951067)
    assert to_complex_string(z) == "-0.642+7.47j"


@pytest.mark.parametrize(
    ("z", "expected"),
    [
        (complex(float("inf"), 0), "inf"),
        (complex(float("-inf"), 0), "-inf"),
        (complex(float("nan"), 0), "nan"),
        (complex(0, float("inf")), "infj"),
        (complex(1, float("-inf")), "1-infj"),
        (complex(float("inf"), float("inf")), "inf+infj"),
    ],
)
def test_complex_string_non_finite(z, expected):
    assert to_complex_string(z) == expected


def test_complex_string_custom_symbol():
    assert to_complex_string(1 + 2j, symbol="i") == "1+2i"


# -----------------------------------------------------------------------------
# Test resample_array


def test_resample_array_orders_by_x():
    arr = np.array([[3, 1, 2], [30, 10, 20]], dtype=np.float64)
    result = resample_array(arr)
    assert result[0] == 10
    assert result[-1] == 30


def test_resample_array_drops_non_finite():
    arr = np.array([[1, 2, 3, 4], [10, np.nan, np.inf, 40]], dtype=np.float64)
    result = resample_array(arr)
    assert np.all(np.isfinite(result))


def test_resample_array_removes_duplicates():
    arr = np.array([[1, 1, 2, 3], [10, 20, 30, 40]], dtype=np.float64)
    result = resample_array(arr)
    assert len(result) == 3


# -----------------------------------------------------------------------------
# Test serialize


def test_serialize_none():
    value, dtype = serialize(None, dtype=DamnitType.NUMBER)
    assert value is None
    assert dtype == DamnitType.NUMBER


def test_serialize_number_finite():
    value, dtype = serialize(42, dtype=DamnitType.NUMBER)
    assert value == 42
    assert dtype == DamnitType.NUMBER


def test_serialize_number_nan():
    value, _ = serialize(np.nan, dtype=DamnitType.NUMBER)
    assert value == "NaN"


def test_serialize_number_inf():
    value, _ = serialize(np.inf, dtype=DamnitType.NUMBER)
    assert value == "Infinity"

    value, _ = serialize(-np.inf, dtype=DamnitType.NUMBER)
    assert value == "-Infinity"


def test_serialize_numpy():
    blob = to_npy_bytes(np.array([1, 2, 3], dtype=np.float64))
    value, dtype = serialize(blob, dtype=DamnitType.NUMPY)
    assert dtype == DamnitType.STRING
    assert "float64" in value


def test_serialize_array_unsupported_shape():
    blob = to_npy_bytes(np.array([1, 2, 3], dtype=np.float64))
    _, dtype = serialize(blob, dtype=DamnitType.ARRAY)
    assert dtype == DamnitType.STRING


def test_serialize_array_valid():
    arr = np.array([[1, 2, 3, 4], [10, 20, 30, 40]], dtype=np.float64)
    value, dtype = serialize(to_npy_bytes(arr), dtype=DamnitType.ARRAY)
    assert dtype == DamnitType.ARRAY
    assert isinstance(value, np.ndarray)


def test_serialize_image():
    value, dtype = serialize(b"\x89PNG\r\n", dtype=DamnitType.IMAGE)
    assert dtype == DamnitType.IMAGE
    assert value.startswith("data:image/png;base64,")
