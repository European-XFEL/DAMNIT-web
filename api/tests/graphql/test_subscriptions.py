from datetime import datetime

import pytest
import pytest_asyncio

from damnit_api.graphql.models import get_model

from .const import (
    EXAMPLE_DTYPES,
    KNOWN_DTYPES,
    KNOWN_VALUES,
    NEW_DTYPES,
    NEW_VALUES,
    NUM_ROWS,
)
from .utils import (
    assert_model,
    create_run_info,
    create_run_variables,
    serialize_data,
)


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
        elif table == "run_info":
            return [create_run_info(**KNOWN_VALUES)]

    mocker.patch(
        "damnit_api.graphql.subscriptions.async_latest_rows",
        side_effect=mocked_returns,
    )


@pytest.fixture
def mocked_new_count(mocker):
    mocker.patch(
        "damnit_api.graphql.subscriptions.async_count",
        return_value=NUM_ROWS + 1,
    )


@pytest.mark.skip(reason="Subscription is currently broken.")
async def test_latest_data(
    graphql_schema, current_timestamp, mocked_latest_rows, mocked_new_count
):
    model = get_model(proposal="1234")
    assert_model(model, proposal="1234", dtypes=EXAMPLE_DTYPES)

    subscription = await graphql_schema.subscribe(
        """
        subscription LatestDataSubcription(
          $proposal: String,
          $timestamp: Timestamp!) {
          latest_data(database: { proposal: $proposal }, timestamp: $timestamp)
        }
        """,
        variable_values={
            "proposal": "1234",
            "timestamp": current_timestamp * 1000,  # some arbitrary timestamp
        },
        context_value={"schema": graphql_schema},
    )

    # Only test the first update
    async for result in subscription:
        assert not result.errors

        data = {**KNOWN_VALUES, **NEW_VALUES}
        dtypes = {**KNOWN_DTYPES, **NEW_DTYPES}

        latest_data = result.data["latest_data"]
        assert set(latest_data.keys()) == {"runs", "metadata"}
        assert latest_data["runs"] == {1: serialize_data(data, dtypes)}

        metadata = latest_data["metadata"]
        assert set(metadata.keys()) == {"rows", "timestamp"}
        assert metadata["timestamp"] == current_timestamp * 1000
        assert metadata["rows"] == NUM_ROWS + 1

        assert_model(model, proposal="1234", dtypes=NEW_DTYPES)

        # Don't forget to break!
        break
