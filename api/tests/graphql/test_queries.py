import pytest

from damnit_api.graphql.models import DamnitRun

from .const import EXAMPLE_VALUES, EXAMPLE_VARIABLES, KNOWN_VALUES, RUNS

# TODO: Test with actual values without mocking the fetch functions


@pytest.fixture
def mocked_fetch_variables(mocker):
    return mocker.patch(
        "damnit_api.graphql.queries.fetch_variables",
        return_value=[EXAMPLE_VALUES],
    )


@pytest.fixture
def mocked_fetch_info(mocker):
    return mocker.patch(
        "damnit_api.graphql.queries.fetch_info",
        return_value=[KNOWN_VALUES],
    )


@pytest.mark.asyncio
async def test_runs_query(
    graphql_schema, mocked_fetch_variables, mocked_fetch_info
):
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
    assert set(metadata.keys()) == {"runs", "variables", "timestamp"}
    assert metadata["runs"] == RUNS
    assert metadata["variables"] == {
        **DamnitRun.known_variables(),
        **EXAMPLE_VARIABLES,
    }
