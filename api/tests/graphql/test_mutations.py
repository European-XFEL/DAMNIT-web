import pytest
import pytest_asyncio

from damnit_api.graphql.models import get_model
from damnit_api.graphql.schema import Schema

from .const import EXAMPLE_DTYPES, KNOWN_VALUES, NEW_VALUES, NUM_ROWS
from .utils import assert_model


@pytest_asyncio.fixture
async def mocked_latest_rows(mocker):
    latest_rows = [{**KNOWN_VALUES, **NEW_VALUES}]
    mocker.patch(
        "damnit_api.graphql.mutations.async_latest_rows",
        return_value=latest_rows,
    )


@pytest.mark.asyncio
async def test_refresh(graphql_schema, mocked_count):
    model = get_model(proposal="1234")
    assert_model(model, proposal="1234", dtypes=None)

    graphql_schema = Schema()
    result = await graphql_schema.execute(
        """
        mutation RefreshMutation($proposal: String) {
          refresh(database: { proposal: $proposal })
        }
        """,
        variable_values={"proposal": "1234"},
        context_value={"schema": graphql_schema},
    )

    assert result.errors is None
    assert set(result.data["refresh"].keys()) == {"metadata"}

    metadata = result.data["refresh"]["metadata"]
    assert set(metadata.keys()) == {"rows", "timestamp"}
    assert metadata["rows"] == NUM_ROWS

    assert_model(model, proposal="1234", dtypes=EXAMPLE_DTYPES)
