import io

import numpy as np
import pytest

from damnit_api.graphql.models import (
    DamnitTable,
    get_model,
    resample_array,
    serialize,
    to_complex_string,
    update_model,
)
from damnit_api.shared.const import DamnitType
from damnit_api.utils import create_map

from .const import EXAMPLE_VARIABLES
from .utils import assert_model


def to_npy_bytes(arr):
    buf = io.BytesIO()
    np.save(buf, arr)
    return buf.getvalue()


# -----------------------------------------------------------------------------
# Test model


def test_get_model():
    model = get_model("foo")
    assert_model(model, proposal="foo")


def test_update_model():
    model = update_model("foo", EXAMPLE_VARIABLES)
    assert_model(model, proposal="foo", variables=EXAMPLE_VARIABLES)


# -----------------------------------------------------------------------------
# Test DamnitTable


def test_damnit_table_no_registered():
    assert (
        len(DamnitTable.registry)  # FIX:  # pyright: ignore[reportAttributeAccessIssue]
        == 0
    )


def test_damnit_table_first_registered():
    model = DamnitTable("foo")
    assert_model(model, proposal="foo")
    assert (
        len(DamnitTable.registry)  # FIX:  # pyright: ignore[reportAttributeAccessIssue]
        == 1
    )


def test_damnit_table_registered_once():
    first = DamnitTable("foo")
    second = DamnitTable("foo")
    assert first is second
    assert (
        len(DamnitTable.registry)  # FIX:  # pyright: ignore[reportAttributeAccessIssue]
        == 1
    )


def test_damnit_table_second_registered():
    first = DamnitTable("first")
    second = DamnitTable("second")
    assert first is not second
    assert (
        len(DamnitTable.registry)  # FIX:  # pyright: ignore[reportAttributeAccessIssue]
        == 2
    )


def test_damnit_table_valid_update():
    variables = create_map([{"name": "foo", "title": "Foo", "tag_ids": []}], key="name")
    model = DamnitTable("foo")
    model.update(variables)
    assert_model(
        model,
        proposal="foo",
        variables=variables,
    )


def test_damnit_table_multiple_update():
    model = DamnitTable("foo")
    first = create_map(
        [
            {"name": "bar", "title": "Bar", "tag_ids": []},
            {"name": "baz", "title": "Baz", "tag_ids": []},
        ],
        key="name",
    )
    model.update(first)
    assert_model(
        model,
        proposal="foo",
        variables=first,
    )

    # Update incompletely
    second = {"bar": {"name": "bar", "title": "Barbar", "tag_ids": []}}
    model.update(second)
    assert_model(
        model,
        proposal="foo",
        variables={**first, **second},
    )


def test_damnit_table_empty_update():
    model = DamnitTable("foo")
    model.update({})
    assert_model(model, proposal="foo", variables={})


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
