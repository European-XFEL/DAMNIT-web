from dataclasses import dataclass

import numpy as np
from numpy.testing import assert_array_equal
import pytest
import xarray as xr

from damnit.api import DataType

from damnit_api.data import (
    get_damnit_type,
    get_extracted_data,
    standardize,
    to_dataarray,
)
from damnit_api.const import DamnitType


# ---- get_damnit_type -------------------------------------------------------


@dataclass
class TestData:
    value: object
    expected_type: DamnitType
    type_hint: DataType | None = None


scalars = [
    TestData(value="foo", expected_type=DamnitType.STRING),
    TestData(value=1234, expected_type=DamnitType.NUMBER),
    TestData(value=False, expected_type=DamnitType.BOOLEAN),
]
images = [
    TestData(
        value=np.random.randint(0, 256, (2, 3, 4), dtype=np.uint8),
        type_hint=DataType.Image,
        expected_type=DamnitType.RGBA,
    ),
]
ndarrays = [
    TestData(
        value=np.random.rand(10),
        expected_type=DamnitType.ARRAY,
    ),
    TestData(
        value=np.random.rand(4, 3),
        expected_type=DamnitType.IMAGE,
    ),
]
dataarrays = [
    TestData(
        xr.DataArray(data.value),
        type_hint=DataType.DataArray,
        expected_type=data.expected_type,
    )
    for data in ndarrays
]
datasets = [
    TestData(
        value=xr.Dataset(
            {
                "a": ("x", np.random.rand(10)),
                "b": ("x", np.random.rand(10)),
            },
            coords={"x": np.arange(10)},
        ),
        type_hint=DataType.Dataset,
        expected_type=DamnitType.DATASET,
    ),
]


@pytest.mark.parametrize(
    "data",
    scalars + images + ndarrays + dataarrays,
)
def test_get_damnit_type_valid(data):
    assert get_damnit_type(data.value, type_hint=data.type_hint) is data.expected_type


@pytest.mark.parametrize(
    "data",
    datasets,
)
def test_get_damnit_type_unsupported(data):
    with pytest.raises(ValueError):
        get_damnit_type(data.value, type_hint=data.type_hint)


# ---- to_dataarray ----------------------------------------------------------


def test_to_dataarray_1d_ndarray():
    data = np.random.rand(10)
    assert to_dataarray(data).equals(
        xr.DataArray(data, dims=["index"], coords={"index": np.arange(data.shape[0])})
    )


def test_to_dataarray_2d_ndarray():
    data = np.random.rand(4, 3)
    assert to_dataarray(data).equals(
        xr.DataArray(
            data,
            dims=["y", "x"],
            coords={"y": np.arange(data.shape[0]), "x": np.arange(data.shape[1])},
        )
    )


def test_to_dataarray_1d_dataarray_no_coords():
    data = xr.DataArray(
        np.random.rand(10),
    )
    assert to_dataarray(data).equals(
        xr.DataArray(
            data.values,
            dims=["index"],
            coords={"index": np.arange(data.shape[0])},
        )
    )


def test_to_dataarray_1d_dataarray_with_coords():
    data = xr.DataArray(
        np.random.rand(4),
        dims=["trains"],
        coords={"trains": [1000, 1001, 1002, 1003]},
    )
    assert to_dataarray(data).equals(data)  # No change


def test_to_dataarray_2d_dataarray_no_coords():
    data = xr.DataArray(
        np.random.rand(4, 3),
    )
    assert to_dataarray(data).equals(
        xr.DataArray(
            data.values,
            dims=["y", "x"],
            coords={
                "y": np.arange(data.shape[0]),
                "x": np.arange(data.shape[1]),
            },
        )
    )


def test_to_dataarray_2d_dataarray_with_coords():
    data = xr.DataArray(
        np.random.rand(4, 3),
        dims=["trains", "pulses"],
        coords={
            "trains": [1000, 1001, 1002, 1003],
            "pulses": [
                0,
                1,
                2,
            ],
        },
    )
    assert to_dataarray(data).equals(data)  # No change


@pytest.mark.parametrize("data", scalars + datasets)
def test_to_data_array_unsupported(data):
    with pytest.raises(ValueError):
        to_dataarray(data)


# ---- standardize -----------------------------------------------------------


def test_standardize_dataarray():
    name = "some_image"
    dtype = DamnitType.IMAGE
    data = xr.DataArray(
        data=np.random.rand(4, 3),
        name=name,
        dims=["y", "x"],
        coords={
            "y": [0, 1, 2, 3],
            "x": [
                0,
                1,
                2,
            ],
        },
        attrs={},
    )

    actual = standardize(data, dtype=dtype.value)
    assert actual["name"] == name
    assert actual["dtype"] == dtype.value
    assert actual["data"] == data.data.tolist()
    assert actual["dims"] == data.dims
    assert_coords(actual["coords"], data.coords)
    assert actual["attrs"] == data.attrs

    # assert actual == expected


def test_standardize_png():
    name = "some_png"
    dtype = DamnitType.PNG
    data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAABQUlEQVR4nAE2Acn+ARvURClMomT2KO"

    assert standardize(data, name=name, dtype=dtype.value) == {
        "data": data,
        "name": name,
        "dtype": dtype.value,
        "attrs": {},
    }


# ---- standardize -----------------------------------------------------------

DAMNIT_CLASS_PATH = "damnit_api.data.Damnit"


def mock_damnit_class(mocker, *, data, type_hint):
    mock_variable = mocker.Mock(
        type_hint=mocker.Mock(return_value=type_hint),
        read=mocker.Mock(return_value=data),
    )
    mock_damnit_cls = mocker.patch(DAMNIT_CLASS_PATH)
    mock_damnit_cls.return_value.__getitem__.return_value = mock_variable
    return mock_damnit_cls


def test_get_extracted_data_ndarray(mocker):
    name = "some_array"
    dtype = DamnitType.ARRAY
    data = np.random.rand(4)

    mock_damnit_class(mocker, data=data, type_hint=None)
    actual = get_extracted_data(proposal=1234, run=1, variable=name)

    assert actual == {
        "name": name,
        "data": data.tolist(),
        "attrs": {"shape": list(data.shape)},
        "dims": ("index",),
        "coords": {"index": [0, 1, 2, 3]},
        "dtype": dtype.value,
    }


def test_get_extracted_data_dataarray(mocker):
    name = "some_array"
    dtype = DamnitType.ARRAY
    data = xr.DataArray(
        np.random.rand(4),
        dims=["trains"],
        coords={"trains": [1000, 1001, 1002, 1003]},
    )

    mock_damnit_class(mocker, data=data, type_hint=DataType.DataArray)
    actual = get_extracted_data(proposal=1234, run=1, variable=name)

    assert actual["name"] == name
    assert actual["dtype"] == dtype.value
    assert actual["data"] == data.data.tolist()
    assert actual["attrs"] == {**data.attrs, "shape": list(data.shape)}

    assert actual["dims"] == data.dims
    assert_coords(actual["coords"], data.coords)


def test_get_extracted_data_png(mocker):
    name = "some_png"
    dtype = DamnitType.PNG  # because we convert RGBA array to PNG string
    data = np.random.randint(0, 256, (2, 3, 4), dtype=np.uint8)

    mock_damnit_class(mocker, data=data, type_hint=DataType.Image)
    actual = get_extracted_data(proposal=1234, run=1, variable=name)

    assert actual["name"] == name
    assert actual["dtype"] == dtype.value
    assert isinstance(actual["data"], str)
    assert actual["attrs"] == {"shape": list(data.shape[:2])}


# ---- helpers -----------------------------------------------------------


def assert_coords(actual, expected):
    assert len(actual) == len(expected)
    for (actual_dim, actual_coord), (expected_dim, expected_coord) in zip(
        actual.items(), expected.items()
    ):
        assert actual_dim == expected_dim
        assert_array_equal(actual_coord, expected_coord)
