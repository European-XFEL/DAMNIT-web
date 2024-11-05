import pytest
import pytest_asyncio

from damnit_api.graphql.bootstrap import bootstrap
from damnit_api.graphql.models import DamnitTable, get_stype
from damnit_api.graphql.schema import Schema

from .const import EXAMPLE_VARIABLES, NUM_ROWS


@pytest.fixture(autouse=True)
def lifespan():
    DamnitTable.registry.clear()
    return


@pytest.fixture
def mocked_bootstrap_variables(mocker):
    mocker.patch(
        "damnit_api.graphql.bootstrap.db.async_variables",
        return_value=EXAMPLE_VARIABLES,
    )


@pytest.fixture
def mocked_bootstrap_count(mocker):
    mocker.patch(
        "damnit_api.graphql.bootstrap.db.async_count",
        return_value=NUM_ROWS,
    )


@pytest_asyncio.fixture
async def graphql_schema(mocked_bootstrap_variables, mocked_bootstrap_count):
    schema = Schema()

    # Initialize
    await bootstrap(proposal="1234")
    schema.update(get_stype("1234"))

    return schema
