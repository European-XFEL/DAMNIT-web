import pytest

from damnit_api.graphql.models import DamnitRun, get_model
from damnit_api.graphql.schema import Schema

from .const import (
    EXAMPLE_TAGS,
    EXAMPLE_VARIABLES,
    RUNS,
)
from .utils import assert_model


@pytest.mark.asyncio
async def test_refresh(graphql_schema):
    model = get_model(proposal="1234")

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
    assert set(
        result.data["refresh"].keys()  # FIX: # pyright: ignore[reportOptionalSubscript]
    ) == {"metadata"}

    metadata = result.data[  # FIX: # pyright: ignore[reportOptionalSubscript]
        "refresh"
    ]["metadata"]
    assert set(metadata.keys()) == {"runs", "timestamp", "variables", "tags"}
    assert metadata["runs"] == RUNS
    assert metadata["variables"] == {
        **DamnitRun.known_variables(),
        **EXAMPLE_VARIABLES,
    }
    assert metadata["tags"] == EXAMPLE_TAGS

    assert_model(
        model,
        proposal="1234",
        variables={
            **DamnitRun.known_variables(),
            **EXAMPLE_VARIABLES,
        },
    )
