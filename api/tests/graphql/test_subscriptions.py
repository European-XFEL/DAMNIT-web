import asyncio
from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from damnit_api.graphql.models import DamnitRun, serialize
from damnit_api.graphql.subscriptions import POLLING_INTERVAL, filter_for_client

from .const import (
    EXAMPLE_VARIABLES,
    KNOWN_DTYPES,
    KNOWN_VALUES,
    NEW_DTYPES,
    NEW_VALUES,
    RUNS,
)
from .utils import create_run_variables

NEW_RUN = 100


patched_sleep = patch.object(asyncio, "sleep", return_value=None)


@pytest.fixture(scope="module")
def current_timestamp():
    return datetime.now(tz=UTC).timestamp()


@pytest.fixture
def mocked_latest_rows(mocker, current_timestamp):
    table_sentinel = mocker.sentinel.run_variables_table
    mocker.patch(
        "damnit_api.graphql.subscriptions.async_table",
        return_value=table_sentinel,
    )

    def mocked_returns(*args, table, **kwargs):
        if table is table_sentinel:
            return create_run_variables(
                NEW_VALUES,
                proposal=KNOWN_VALUES["proposal"],
                run=NEW_RUN,
                timestamp=current_timestamp,
            )
        return None

    return mocker.patch(
        "damnit_api.graphql.subscriptions.async_latest_rows",
        side_effect=mocked_returns,
    )


@pytest.fixture
def mocked_variables(mocker):
    return mocker.patch(
        "damnit_api.graphql.subscriptions.async_variables",
        return_value=EXAMPLE_VARIABLES,
    )


@pytest.fixture
def mocked_fetch_info(mocker):
    return mocker.patch(
        "damnit_api.graphql.subscriptions.fetch_info",
        return_value=[{**KNOWN_VALUES, "run": NEW_RUN}],
    )


@pytest.mark.asyncio
async def test_latest_data(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
    mocked_variables,
):
    subscription = await graphql_schema.subscribe(
        """
        subscription LatestDataSubscription(
          $proposal: String,
          $timestamp: Timestamp!) {
          latest_data(database: { proposal: $proposal }, timestamp: $timestamp)
        }
        """,
        variable_values={
            "proposal": "1234",
            "timestamp": (current_timestamp - 1) * 1000,  # before the new row
        },
        context_value={
            "schema": graphql_schema,
        },
    )

    result = await asyncio.wait_for(anext(subscription), timeout=2)
    assert not result.errors

    data = {**KNOWN_VALUES, **NEW_VALUES, "run": NEW_RUN}
    dtypes = {**KNOWN_DTYPES, **NEW_DTYPES}

    latest_data = result.data["latest_data"]
    assert set(latest_data.keys()) == {"runs", "metadata"}
    assert latest_data["runs"] == {
        NEW_RUN: {
            name: {
                "value": serialize(value, dtype=dtypes[name])[0],
                "dtype": dtypes[name].value,
            }
            for name, value in data.items()
        }
    }

    metadata = latest_data["metadata"]
    assert set(metadata.keys()) == {"runs", "timestamp", "variables"}
    assert metadata["runs"] == [*RUNS, NEW_RUN]
    assert metadata["timestamp"] == current_timestamp * 1000
    assert metadata["variables"] == {
        **DamnitRun.known_variables(),
        **EXAMPLE_VARIABLES,
    }


@pytest.mark.asyncio
async def test_latest_data_with_concurrent_subscriptions(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
    mocked_variables,
):
    query = """
        subscription LatestDataSubscription(
          $proposal: String,
          $timestamp: Timestamp!) {
          latest_data(database: { proposal: $proposal }, timestamp: $timestamp)
        }
        """
    variables = {
        "proposal": "1234",
        "timestamp": (current_timestamp - 1) * 1000,  # before the new row
    }
    context = {
        "schema": graphql_schema,
    }

    first_sub = await graphql_schema.subscribe(
        query,
        variable_values=variables,
        context_value=context,
    )
    second_sub = await graphql_schema.subscribe(
        query,
        variable_values=variables,
        context_value=context,
    )

    with patched_sleep:
        result = await asyncio.wait_for(anext(first_sub), timeout=2)
        assert not result.errors
        mocked_latest_rows.assert_called()

    mocked_latest_rows.reset_mock()

    with patched_sleep:
        result = await asyncio.wait_for(anext(second_sub), timeout=2)
        assert not result.errors
        mocked_latest_rows.assert_not_called()


@pytest.mark.asyncio
async def test_latest_data_with_nonconcurrent_subscriptions(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
    mocked_variables,
):
    query = """
        subscription LatestDataSubscription(
          $proposal: String,
          $timestamp: Timestamp!) {
          latest_data(database: { proposal: $proposal }, timestamp: $timestamp)
        }
        """
    variables = {
        "proposal": "1234",
        "timestamp": (current_timestamp - 1) * 1000,  # before the new row
    }
    context = {
        "schema": graphql_schema,
    }

    first_sub = await graphql_schema.subscribe(
        query,
        variable_values=variables,
        context_value=context,
    )
    second_sub = await graphql_schema.subscribe(
        query,
        variable_values=variables,
        context_value=context,
    )

    with patched_sleep:
        result = await asyncio.wait_for(anext(first_sub), timeout=2)
        assert not result.errors
        mocked_latest_rows.assert_called()

    await asyncio.sleep(POLLING_INTERVAL * 3)  # give enough time to clear the cache
    mocked_latest_rows.reset_mock()

    with patched_sleep:
        result = await asyncio.wait_for(anext(second_sub), timeout=2)
        assert not result.errors
        mocked_latest_rows.assert_called()


# -----------------------------------------------------------------------------
# filter_for_client


def _snapshot(run_timestamps):
    runs = {run: {"value": run} for run in run_timestamps}
    return {
        "runs": runs,
        "run_timestamps": run_timestamps,
        "max_timestamp": max(run_timestamps.values()),
        "metadata": {"runs": list(runs), "variables": {}, "timestamp": 0},
    }


def test_filter_for_client_none_snapshot():
    assert filter_for_client(None, since=0) is None


def test_filter_for_client_since_zero_returns_none():
    snapshot = _snapshot({1: 100.0, 2: 200.0})
    assert filter_for_client(snapshot, since=0) is None


def test_filter_for_client_excludes_equal_timestamp():
    snapshot = _snapshot({1: 100.0, 2: 200.0})
    result = filter_for_client(snapshot, since=100.0)
    assert set(result["runs"].keys()) == {2}


def test_filter_for_client_since_above_all_returns_none():
    snapshot = _snapshot({1: 100.0, 2: 200.0})
    assert filter_for_client(snapshot, since=300.0) is None
