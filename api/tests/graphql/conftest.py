import pytest
import strawberry
from strawberry.schema.config import StrawberryConfig

from damnit_api.graphql import subscriptions
from damnit_api.graphql.directives import lightweight
from damnit_api.graphql.metadata import fetch_metadata
from damnit_api.graphql.models import SCALAR_MAP, DamnitVariable
from damnit_api.graphql.queries import Query
from damnit_api.graphql.subscriptions import Subscription, poll_proposal

from .const import (
    EXAMPLE_TAGS,
    EXAMPLE_VARIABLE_TAGS,
    EXAMPLE_VARIABLES,
    RUNS,
)


@pytest.fixture(autouse=True)
def reset_caches():
    fetch_metadata.cache_clear()
    poll_proposal.cache_clear()
    subscriptions._last_seen_timestamp.clear()
    return


@pytest.fixture
def mocked_metadata_variables(mocker):
    mocker.patch(
        "damnit_api.graphql.metadata.db.async_variables",
        return_value=EXAMPLE_VARIABLES,
    )


@pytest.fixture
def mocked_metadata_all_tags(mocker):
    mocker.patch(
        "damnit_api.graphql.metadata.db.async_all_tags",
        return_value=EXAMPLE_TAGS,
    )


@pytest.fixture
def mocked_metadata_variable_tags(mocker):
    mocker.patch(
        "damnit_api.graphql.metadata.db.async_variable_tags",
        return_value=EXAMPLE_VARIABLE_TAGS,
    )


@pytest.fixture
def mocked_metadata_column(mocker):
    mocker.patch(
        "damnit_api.graphql.metadata.db.async_column",
        return_value=RUNS,
    )


@pytest.fixture
def mocked_metadata_max(mocker):
    mocker.patch(
        "damnit_api.graphql.metadata.db.async_max",
        return_value=0,
    )


@pytest.fixture
def graphql_schema(
    mocked_metadata_variables,
    mocked_metadata_column,
    mocked_metadata_all_tags,
    mocked_metadata_variable_tags,
    mocked_metadata_max,
):
    return strawberry.Schema(
        query=Query,
        subscription=Subscription,
        types=[DamnitVariable],
        directives=[lightweight],
        config=StrawberryConfig(
            auto_camel_case=False,
            scalar_map=SCALAR_MAP,
        ),
    )
