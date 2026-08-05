import io
import json

import numpy as np
import pytest

from damnit_api.runs.serialization import (
    resample_array,
    serialize,
    to_complex_string,
)
from damnit_api.runs.types import CellError, DamnitRun
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
    _, dtype = serialize(blob, dtype=DamnitType.ARRAY_1D)
    assert dtype == DamnitType.STRING


def test_serialize_reduces_a_2xn_trendline_to_one_series():
    arr = np.array([[1, 2, 3, 4], [10, 20, 30, 40]], dtype=np.float64)
    value, dtype = serialize(to_npy_bytes(arr), dtype=DamnitType.ARRAY_1D)
    assert dtype == DamnitType.ARRAY_1D
    assert isinstance(value, np.ndarray)


def test_serialize_image():
    value, dtype = serialize(b"\x89PNG\r\n", dtype=DamnitType.IMAGE)
    assert dtype == DamnitType.IMAGE
    assert value.startswith("data:image/png;base64,")


# -----------------------------------------------------------------------------
# Test CellError.from_attrs

ERROR_ATTRS = {"error": "IndexError: list index out of range", "error_cls": "Foo"}


def test_extract_error_from_json_string():
    error = CellError.from_attrs(json.dumps(ERROR_ATTRS))
    assert error == CellError(message=ERROR_ATTRS["error"], cls="Foo")


@pytest.mark.parametrize(
    "attributes",
    [
        None,
        {"error": "boom", "error_cls": "Foo"},
        "not json",
        "123",
        "{}",
        '{"error": "boom"}',
        '{"error": "boom", "error_cls": 42}',
    ],
)
def test_extract_error_returns_none(attributes):
    assert CellError.from_attrs(attributes) is None


# -----------------------------------------------------------------------------
# Test DamnitRun error path


def test_from_db_includes_error_for_failed_variable():
    record = {
        "proposal": {"value": 900485},
        "run": {"value": 1},
        "broken": {"value": None, "attributes": json.dumps(ERROR_ATTRS)},
    }
    run = DamnitRun.from_db(record, database="900485")

    by_name = {v.name: v for v in run.cells()}
    assert by_name["run"].error is None
    assert by_name["broken"].summary.value is None
    assert by_name["broken"].error == CellError(message=ERROR_ATTRS["error"], cls="Foo")


def test_from_db_drops_a_heavy_summary_type_when_the_variable_failed():
    # The client merges a cell's summary without being able to see the error
    # beside it, so a heavy dtype on a null value reads as one @lightweight held
    # back and pins whatever the cell held before it failed.
    record = {
        "proposal": {"value": 900485},
        "run": {"value": 1},
        "broken": {
            "value": None,
            "summary_type": "trendline",
            "attributes": json.dumps(ERROR_ATTRS),
        },
    }
    run = DamnitRun.from_db(record, database="900485")

    assert run.cells(names=["broken"])[0].summary.dtype == DamnitType.STRING


def test_from_db_populates_identity_trio():
    record = {"proposal": {"value": 900485}, "run": {"value": 348}}
    run = DamnitRun.from_db(record, database="900485")

    assert run.database == "900485"
    assert run.proposal == "900485"
    assert run.run == 348


def test_from_db_scopes_cell_ids_by_database():
    # The same (proposal, run, name) served through two databases (a guest
    # proposal also opened directly) must key distinct normalized cells, so the
    # second database cannot overwrite the first's cached value.
    record = {
        "proposal": {"value": 900485},
        "run": {"value": 348},
        "n_trains": {"value": 3641},
    }
    guest = DamnitRun.from_db(record, database="900405")
    direct = DamnitRun.from_db(record, database="900485")

    assert guest.cells(names=["n_trains"])[0].id == "900405:900485:348:n_trains"
    assert direct.cells(names=["n_trains"])[0].id == "900485:900485:348:n_trains"


def test_from_db_rejects_a_database_handle_carrying_a_colon():
    # Cell ids join their parts with ":", so a handle carrying one of its own
    # would let two different cells share an id and collide in the client cache.
    record = {"proposal": {"value": 900485}, "run": {"value": 348}}

    with pytest.raises(ValueError, match="may not contain"):
        DamnitRun.from_db(record, database="900405:900485")
