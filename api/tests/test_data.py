from dataclasses import dataclass

import numpy as np
import plotly.graph_objects as go
import pytest
import xarray as xr
from damnit.api import DataType
from numpy.testing import assert_array_equal

from damnit_api.runs.preview import (
    NOT_SUPPORTED_MESSAGE,
    downsample,
    get_damnit_type,
    get_preview_data,
    standardize,
    to_dataarray,
)
from damnit_api.shared.const import DamnitType

# -----------------------------------------------------------------------------
# get_damnit_type


@dataclass
class ExtractedData:
    value: object
    dtype: DamnitType | None = None
    type_hint: DataType | None = None


scalars = [
    ExtractedData(value="foo", dtype=DamnitType.STRING),
    ExtractedData(value=1234, dtype=DamnitType.NUMBER),
    ExtractedData(value=False, dtype=DamnitType.BOOLEAN),
]
images = [
    ExtractedData(
        value=np.random.randint(0, 256, (2, 3, 4), dtype=np.uint8),
        type_hint=DataType.Image,
        dtype=DamnitType.IMAGE,
    ),
]
ndarrays = [
    ExtractedData(
        value=np.random.rand(10),
        dtype=DamnitType.ARRAY_1D,
    ),
    ExtractedData(
        value=np.random.rand(4, 3),
        dtype=DamnitType.ARRAY_2D,
    ),
]
dataarrays = [
    ExtractedData(
        xr.DataArray(data.value),
        type_hint=DataType.DataArray,
        dtype=data.dtype,
    )
    for data in ndarrays
]
datasets = [
    ExtractedData(
        value=xr.Dataset(
            {
                "a": ("x", np.random.rand(10)),
                "b": ("x", np.random.rand(10)),
            },
            coords={"x": np.arange(10)},
        ),
        type_hint=DataType.Dataset,
    ),
]
figures = [ExtractedData(value=go.Figure(go.Scatter(y=np.random.rand(10))))]


@pytest.mark.parametrize(
    "data",
    scalars + images + ndarrays + dataarrays,
)
def test_get_damnit_type_valid(data):
    assert get_damnit_type(data.value, type_hint=data.type_hint) is data.dtype


@pytest.mark.parametrize(
    "data",
    datasets + figures,
)
def test_get_damnit_type_unsupported(data):
    with pytest.raises(ValueError, match=NOT_SUPPORTED_MESSAGE):
        get_damnit_type(data.value, type_hint=data.type_hint)


# -----------------------------------------------------------------------------
# to_dataarray


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
            coords={
                "y": np.arange(data.shape[0]),
                "x": np.arange(data.shape[1]),
            },
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
    with pytest.raises(ValueError, match=NOT_SUPPORTED_MESSAGE):
        to_dataarray(data.value)


# -----------------------------------------------------------------------------
# downsample


def test_downsample_caps_only_the_long_axis_of_a_narrow_array():
    data = xr.DataArray(
        np.random.rand(1_200, 20),
        dims=["y", "x"],
        coords={"y": np.arange(1_200) * 0.5 + 100, "x": np.arange(20)},
    )

    actual = downsample(data)

    assert actual.shape == (1_000, 20)
    # Picked points, not interpolated ones: each sits on an original coordinate
    assert actual.equals(data.sel(y=actual.coords["y"]))


def test_downsample_sorts_the_axes_of_a_heatmap_whose_rows_came_out_of_order():
    rows = np.concatenate([np.arange(600, 1_200), np.arange(600)])
    data = xr.DataArray(
        np.random.rand(1_200, 20),
        dims=["y", "x"],
        coords={"y": rows, "x": np.arange(20)},
    )

    actual = downsample(data)

    assert np.all(np.diff(actual.coords["y"]) > 0)
    assert actual.equals(data.sel(y=actual.coords["y"]))


def test_downsample_keeps_the_minimum_and_maximum_of_a_long_1d_array():
    data = np.zeros(12_000)
    data[3] = 5.0  # 3 and 9 fall between the evenly spaced picks
    data[9] = -2.0

    actual = downsample(to_dataarray(data))

    assert actual.size == 10_002
    assert actual.max() == pytest.approx(5.0)
    assert actual.min() == pytest.approx(-2.0)


def test_downsample_keeps_the_finite_extremes_of_a_trace_with_infinite_readings():
    data = np.zeros(12_000)
    data[3] = 5.0
    data[9] = -2.0
    data[21] = np.inf  # The preview sends an infinity as null
    data[27] = -np.inf

    actual = downsample(to_dataarray(data)).values

    finite = actual[np.isfinite(actual)]
    assert finite.max() == pytest.approx(5.0)
    assert finite.min() == pytest.approx(-2.0)


def test_downsample_keeps_only_the_even_picks_of_a_trace_with_no_finite_reading():
    data = np.full(12_000, np.nan)

    actual = downsample(to_dataarray(data))

    assert actual.size == 10_000


# -----------------------------------------------------------------------------
# standardize


def test_standardize_dataarray():
    name = "some_array"
    dtype = DamnitType.ARRAY_2D
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


def test_standardize_image():
    name = "some_image"
    dtype = DamnitType.IMAGE
    data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAABQUlEQVR4nAE2Acn+ARvURClMomT2KO"  # noqa: E501

    assert standardize(data, name=name, dtype=dtype.value) == {
        "data": data,
        "name": name,
        "dtype": dtype.value,
        "attrs": {},
    }


# -----------------------------------------------------------------------------
# get_preview_data

DAMNIT_CLASS_PATH = "damnit_api.runs.preview.Damnit"


def mock_damnit_class(mocker, *, data, type_hint):
    mocker.patch("damnit_api.runs.preview.get_damnit_path", return_value="/mock/path")
    mock_variable = mocker.Mock(
        preview_data=mocker.Mock(return_value=None),
        type_hint=mocker.Mock(return_value=type_hint),
        read=mocker.Mock(return_value=data),
    )
    mock_damnit_cls = mocker.patch(DAMNIT_CLASS_PATH)
    mock_damnit_cls.return_value.__getitem__.return_value = mock_variable
    return mock_damnit_cls


def test_get_preview_data_ndarray(mocker):
    name = "some_array"
    dtype = DamnitType.ARRAY_1D
    data = np.random.rand(4)

    mock_damnit_class(mocker, data=data, type_hint=None)
    actual = get_preview_data(proposal=1234, run_id=(None, 1), variable=name)

    assert actual == {
        "name": name,
        "data": data.tolist(),
        "attrs": {"shape": list(data.shape)},
        "dims": ("index",),
        "coords": {"index": [0, 1, 2, 3]},
        "dtype": dtype.value,
    }


def test_get_preview_data_dataarray(mocker):
    name = "some_array"
    dtype = DamnitType.ARRAY_1D
    data = xr.DataArray(
        np.random.rand(4),
        dims=["trains"],
        coords={"trains": [1000, 1001, 1002, 1003]},
    )

    mock_damnit_class(mocker, data=data, type_hint=DataType.DataArray)
    actual = get_preview_data(proposal=1234, run_id=(None, 1), variable=name)

    assert actual["name"] == name
    assert actual["dtype"] == dtype.value
    assert actual["data"] == data.data.tolist()
    assert actual["attrs"] == {**data.attrs, "shape": list(data.shape)}

    assert actual["dims"] == data.dims
    assert_coords(actual["coords"], data.coords)


def test_get_preview_data_downsamples_a_large_bool_array_as_numbers(mocker):
    data = np.arange(20_000) % 2 == 0

    mock_damnit_class(mocker, data=data, type_hint=None)
    actual = get_preview_data(proposal=1234, run_id=(None, 1), variable="some_mask")

    assert actual["dtype"] == DamnitType.ARRAY_1D.value
    assert len(actual["data"]) == 10_001


def test_get_preview_data_image(mocker):
    name = "some_image"
    dtype = DamnitType.IMAGE  # a colour array is rendered to a PNG string
    data = np.random.randint(0, 256, (2, 3, 4), dtype=np.uint8)

    mock_damnit_class(mocker, data=data, type_hint=DataType.Image)
    actual = get_preview_data(proposal=1234, run_id=(None, 1), variable=name)

    assert actual["name"] == name
    assert actual["dtype"] == dtype.value
    assert isinstance(actual["data"], str)
    assert actual["attrs"] == {"shape": list(data.shape[:2])}


# -----------------------------------------------------------------------------
# helpers


def assert_coords(actual, expected):
    assert len(actual) == len(expected)
    for (actual_dim, actual_coord), (expected_dim, expected_coord) in zip(
        actual.items(), expected.items(), strict=True
    ):
        assert actual_dim == expected_dim
        assert_array_equal(actual_coord, expected_coord)
