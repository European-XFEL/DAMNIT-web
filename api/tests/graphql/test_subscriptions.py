import asyncio
from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from damnit_api.graphql.models import DamnitRun
from damnit_api.graphql.subscriptions import POLLING_INTERVAL, filter_for_client
from damnit_api.shared.const import DamnitType

from .const import (
    EXAMPLE_VARIABLES,
    KNOWN_DATA,
    NEW_DATA,
    PROPOSAL,
    RUNS,
    DatabaseVariable,
    get_values,
)
from .utils import create_run_variables

NEW_RUN = 400


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
    mocker.patch(
        "damnit_api.graphql.subscriptions.async_max",
        return_value=0,
    )

    def mocked_returns(*args, table, **kwargs):
        if table is table_sentinel:
            return create_run_variables(
                get_values(NEW_DATA),
                proposal=PROPOSAL,
                run=NEW_RUN,
                timestamp=current_timestamp,
            )
        return None

    return mocker.patch(
        "damnit_api.graphql.subscriptions.async_latest_rows",
        side_effect=mocked_returns,
    )


@pytest.fixture
def mocked_fetch_info(mocker):
    return mocker.patch(
        "damnit_api.graphql.subscriptions.fetch_info",
        return_value=[{**get_values(KNOWN_DATA), "run": NEW_RUN}],
    )


@pytest.mark.asyncio
async def test_latest_data(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
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
            "proposal": str(PROPOSAL),
            "timestamp": (current_timestamp - 1) * 1000,  # before the new row
        },
    )

    try:
        result = await asyncio.wait_for(anext(subscription), timeout=2)
        assert not result.errors

        data = {
            **KNOWN_DATA,
            **NEW_DATA,
            "run": DatabaseVariable(
                value=NEW_RUN,
                damnit_dtype=DamnitType.NUMBER,
            ),
        }

        latest_data = result.data["latest_data"]
        assert set(latest_data.keys()) == {"runs", "metadata"}
        assert latest_data["runs"] == {
            NEW_RUN: {
                name: {
                    "value": var.damnit_value,
                    "dtype": var.damnit_dtype.value,
                }
                for name, var in data.items()
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
    finally:
        await subscription.aclose()


@pytest.mark.asyncio
async def test_latest_data_with_concurrent_subscriptions(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
):
    query = """
        subscription LatestDataSubscription(
          $proposal: String,
          $timestamp: Timestamp!) {
          latest_data(database: { proposal: $proposal }, timestamp: $timestamp)
        }
        """
    variables = {
        "proposal": str(PROPOSAL),
        "timestamp": (current_timestamp - 1) * 1000,  # before the new row
    }

    first_sub = await graphql_schema.subscribe(
        query,
        variable_values=variables,
    )
    second_sub = await graphql_schema.subscribe(
        query,
        variable_values=variables,
    )

    try:
        with patched_sleep:
            result = await asyncio.wait_for(anext(first_sub), timeout=2)
            assert not result.errors
            mocked_latest_rows.assert_called()

        mocked_latest_rows.reset_mock()

        with patched_sleep:
            result = await asyncio.wait_for(anext(second_sub), timeout=2)
            assert not result.errors
            mocked_latest_rows.assert_not_called()
    finally:
        await first_sub.aclose()
        await second_sub.aclose()


@pytest.mark.asyncio
async def test_latest_data_with_nonconcurrent_subscriptions(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
):
    query = """
        subscription LatestDataSubscription(
          $proposal: String,
          $timestamp: Timestamp!) {
          latest_data(database: { proposal: $proposal }, timestamp: $timestamp)
        }
        """
    variables = {
        "proposal": str(PROPOSAL),
        "timestamp": (current_timestamp - 1) * 1000,  # before the new row
    }

    first_sub = await graphql_schema.subscribe(
        query,
        variable_values=variables,
    )
    second_sub = await graphql_schema.subscribe(
        query,
        variable_values=variables,
    )

    try:
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
    finally:
        await first_sub.aclose()
        await second_sub.aclose()


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
