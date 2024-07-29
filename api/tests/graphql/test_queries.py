import pytest
import pytest_asyncio

from damnit_api.graphql.models import DamnitRun

from .const import EXAMPLE_VALUES, EXAMPLE_VARIABLES, KNOWN_VALUES, NUM_ROWS
from .utils import session_mock


@pytest_asyncio.fixture
async def mocked_session(mocker):
    mocker.patch(
        "damnit_api.graphql.queries.get_session",
        return_value=session_mock([{**KNOWN_VALUES, **EXAMPLE_VALUES}]),
    )


@pytest.mark.asyncio
async def test_runs_query(graphql_schema, mocked_session):
    query = """
        query TableDataQuery($per_page: Int = 2) {
          runs(database: {proposal: "1234"}, per_page: $per_page) {
            run {
              value
            }
            ... on p1234 {
              integer {
                value
              }
            }
          }
        }
    """
    result = await graphql_schema.execute(query)

    assert result.errors is None

    runs = result.data["runs"]
    assert len(runs) == 1
    assert list(runs[0].keys()) == ["run", "integer"]


def test_metadata_query(graphql_schema):
    query = """
        query TableMetadataQuery($proposal: String) {
          metadata(database: { proposal: $proposal })
        }
    """
    result = graphql_schema.execute_sync(
        query,
        variable_values={
            "proposal": "1234",
        },
    )

    assert result.errors is None

    metadata = result.data["metadata"]
    assert set(metadata.keys()) == {"rows", "variables", "timestamp"}
    assert metadata["rows"] == NUM_ROWS
    assert metadata["variables"] == {
        **DamnitRun.known_variables(),
        **EXAMPLE_VARIABLES,
    }
