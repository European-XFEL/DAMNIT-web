from damnit_api.graphql.utils import LatestData

from .const import EXAMPLE_DATA, NEW_DATA, PROPOSAL, get_values


def to_row(values, proposal=PROPOSAL, run=1, timestamp=1):
    return [
        {
            "proposal": proposal,
            "run": run,
            "name": name,
            "value": value,
            "timestamp": timestamp,
        }
        for name, value in values.items()
    ]


def test_latest_data_update_run():
    example_values = get_values(EXAMPLE_DATA)
    new_values = get_values(NEW_DATA)

    first = to_row(example_values)
    second = to_row(new_values, timestamp=2)

    latest_data = LatestData.from_list(first + second)
    assert len(latest_data.runs) == 1

    key, variables = next(iter(latest_data.runs.items()))
    assert key == (PROPOSAL, 1)

    updated_values = {**example_values, **new_values}
    assert variables.keys() == updated_values.keys()
    for name, data in variables.items():
        assert data.value == updated_values[name]
        assert data.timestamp == (2 if name in new_values else 1)


def test_latest_data_multiple_runs():
    example_values = get_values(EXAMPLE_DATA)
    new_values = get_values(NEW_DATA)

    first = to_row(example_values, run=1)
    second = to_row(new_values, run=2)

    latest_data = LatestData.from_list(first + second)
    assert list(latest_data.runs.keys()) == [(PROPOSAL, 1), (PROPOSAL, 2)]

    run_1 = latest_data.runs[PROPOSAL, 1]
    assert run_1.keys() == example_values.keys()
    for name, data in run_1.items():
        assert data.value == example_values[name]
        assert data.timestamp == 1

    run_2 = latest_data.runs[PROPOSAL, 2]
    assert run_2.keys() == new_values.keys()
    for name, data in run_2.items():
        assert data.value == new_values[name]
        assert data.timestamp == 1


def test_latest_data_keeps_colliding_run_numbers_apart():
    """The same run number in two proposals stays two runs, not one."""
    guest = 900405
    principal_values = get_values(EXAMPLE_DATA)
    guest_values = get_values(NEW_DATA)

    principal = to_row(principal_values, proposal=PROPOSAL, run=5)
    other = to_row(guest_values, proposal=guest, run=5)

    latest_data = LatestData.from_list(principal + other)

    assert set(latest_data.runs.keys()) == {(PROPOSAL, 5), (guest, 5)}
    assert latest_data.runs[PROPOSAL, 5].keys() == principal_values.keys()
    assert latest_data.runs[guest, 5].keys() == guest_values.keys()
