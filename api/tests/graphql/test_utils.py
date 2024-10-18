from damnit_api.graphql.utils import LatestData

from .const import EXAMPLE_DTYPES, EXAMPLE_VALUES, NEW_DTYPES, NEW_VALUES


def to_row(values, run=1, timestamp=1):
    return [
        {"run": run, "name": name, "value": value, "timestamp": timestamp}
        for name, value in values.items()
    ]


def test_latest_data_update_run():
    first = to_row(EXAMPLE_VALUES)
    second = to_row(NEW_VALUES, timestamp=2)

    latest_data = LatestData.from_list(first + second)
    assert len(latest_data.runs) == 1

    run, variables = next(iter(latest_data.runs.items()))
    assert run == 1
    assert variables.keys() == NEW_VALUES.keys()
    for name, data in variables.items():
        assert data.value == NEW_VALUES[name]
        assert data.dtype == NEW_DTYPES[name]
        assert data.timestamp == 2


def test_latest_data_multiple_runs():
    first = to_row(EXAMPLE_VALUES, run=1)
    second = to_row(NEW_VALUES, run=2)

    latest_data = LatestData.from_list(first + second)
    assert list(latest_data.runs.keys()) == [1, 2]

    run_1 = latest_data.runs[1]
    assert run_1.keys() == EXAMPLE_VALUES.keys()
    for name, data in run_1.items():
        assert data.value == EXAMPLE_VALUES[name]
        assert data.dtype == EXAMPLE_DTYPES[name]
        assert data.timestamp == 1

    run_2 = latest_data.runs[2]
    assert run_2.keys() == NEW_VALUES.keys()
    for name, data in run_2.items():
        assert data.value == NEW_VALUES[name]
        assert data.dtype == NEW_DTYPES[name]
        assert data.timestamp == 1
