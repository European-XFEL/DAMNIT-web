import pytest
import pytest_asyncio

from damnit_api.graphql.bootstrap import bootstrap
from damnit_api.graphql.models import DamnitTable, get_stype
from damnit_api.graphql.schema import Schema

from .const import EXAMPLE_TAGS, EXAMPLE_VARIABLE_TAGS, EXAMPLE_VARIABLES, RUNS


@pytest.fixture(autouse=True)
def lifespan():
    DamnitTable.registry.clear()
    bootstrap.cache_clear()
    return


@pytest.fixture
def mocked_bootstrap_variables(mocker):
    mocker.patch(
        "damnit_api.graphql.bootstrap.db.async_variables",
        return_value=EXAMPLE_VARIABLES,
    )


@pytest.fixture
def mocked_bootstrap_all_tags(mocker):
    mocker.patch(
        "damnit_api.graphql.bootstrap.db.async_all_tags",
        return_value=EXAMPLE_TAGS,
    )


@pytest.fixture
def mock_bootstrap_variable_tags(mocker):
    mocker.patch(
        "damnit_api.graphql.bootstrap.db.async_variable_tags",
        return_value=EXAMPLE_VARIABLE_TAGS,
    )


@pytest.fixture
def mocked_bootstrap_column(mocker):
    mocker.patch(
        "damnit_api.graphql.bootstrap.db.async_column",
        return_value=RUNS,
    )


@pytest_asyncio.fixture
async def graphql_schema(
    mocked_bootstrap_variables,
    mocked_bootstrap_column,
    mocked_bootstrap_all_tags,
    mock_bootstrap_variable_tags,
):
    schema = Schema()

    # Initialize
    await bootstrap(proposal="1234")
    schema.update(get_stype("1234"))

    return schema
