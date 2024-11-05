import asyncio
from datetime import datetime
from unittest.mock import patch

import pytest
import pytest_asyncio

from damnit_api.graphql.models import DamnitRun, serialize
from damnit_api.graphql.subscriptions import POLLING_INTERVAL

from .const import (
    EXAMPLE_VARIABLES,
    KNOWN_DTYPES,
    KNOWN_VALUES,
    NEW_DTYPES,
    NEW_VALUES,
    NUM_ROWS,
)
from .utils import (
    create_run_info,
    create_run_variables,
)


patched_sleep = patch.object(asyncio, "sleep", return_value=asyncio.sleep(0))


@pytest.fixture(scope="module")
def current_timestamp():
    return datetime.now().timestamp()


@pytest_asyncio.fixture
async def mocked_latest_rows(mocker, current_timestamp):
    def mocked_returns(*args, table, **kwargs):
        if table == "run_variables":
            return create_run_variables(
                NEW_VALUES,
                proposal=KNOWN_VALUES["proposal"],
                run=KNOWN_VALUES["run"],
                timestamp=current_timestamp,
            )
        if table == "run_info":
            return [create_run_info(**KNOWN_VALUES)]
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
def mocked_new_count(mocker):
    return mocker.patch(
        "damnit_api.graphql.subscriptions.async_count",
        return_value=NUM_ROWS + 1,
    )


@pytest.mark.asyncio
async def test_latest_data(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_new_count,
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
            "timestamp": current_timestamp * 1000,  # some arbitrary timestamp
        },
        context_value={
            "schema": graphql_schema,
        },
    )

    # Only test the first update
    async for result in subscription:
        assert not result.errors

        data = {**KNOWN_VALUES, **NEW_VALUES}
        dtypes = {**KNOWN_DTYPES, **NEW_DTYPES}

        latest_data = result.data["latest_data"]
        assert set(latest_data.keys()) == {"runs", "metadata"}
        assert latest_data["runs"] == {
            1: {
                name: {
                    "value": serialize(value, dtype=dtypes[name]),
                    "dtype": dtypes[name].value,
                }
                for name, value in data.items()
            }
        }

        metadata = latest_data["metadata"]
        assert set(metadata.keys()) == {"rows", "timestamp", "variables"}
        assert metadata["rows"] == NUM_ROWS + 1
        assert metadata["timestamp"] == current_timestamp * 1000
        assert metadata["variables"] == {
            **DamnitRun.known_variables(),
            **EXAMPLE_VARIABLES,
        }

        # Don't forget to break!
        break


@pytest.mark.asyncio
async def test_latest_data_with_concurrent_subscriptions(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_new_count,
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
        "timestamp": current_timestamp * 1000,  # some arbitrary timestamp
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
        async for result in first_sub:
            # Only test the first update
            assert not result.errors
            mocked_latest_rows.assert_called()
            break

    mocked_latest_rows.reset_mock()

    with patched_sleep:
        async for result in second_sub:
            # Only test the first update
            assert not result.errors
            mocked_latest_rows.assert_not_called()
            break


@pytest.mark.asyncio
async def test_latest_data_with_nonconcurrent_subscriptions(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_new_count,
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
        "timestamp": current_timestamp * 1000,  # some arbitrary timestamp
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
        async for result in first_sub:
            # Only test the first update
            assert not result.errors
            mocked_latest_rows.assert_called()
            break

    await asyncio.sleep(POLLING_INTERVAL * 3)  # give enough time to clear the cache
    mocked_latest_rows.reset_mock()

    with patched_sleep:
        async for result in second_sub:
            # Only test the first update
            assert not result.errors
            mocked_latest_rows.assert_called()
            break
