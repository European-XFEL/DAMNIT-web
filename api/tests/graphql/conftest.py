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
def bypass_proposal_permission(mocker):
    """Bypass all proposal permission checks so tests focus on resolver logic."""
    mocker.patch(
        "damnit_api.auth.permissions.IsAuthenticated.has_permission",
        new_callable=mocker.AsyncMock,
        return_value=True,
    )
    mocker.patch(
        "damnit_api.auth.permissions.IsProposalMember.has_permission",
        new_callable=mocker.AsyncMock,
        return_value=True,
    )


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
def mocked_ensure_damnit_path(mocker):
    """Bypass the damnit_path validation; tests run without a request context."""
    mocker.patch(
        "damnit_api.graphql.queries._ensure_damnit_path",
        return_value=None,
    )


@pytest.fixture
def graphql_schema(
    bypass_proposal_permission,
    mocked_ensure_damnit_path,
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


@pytest.fixture
def graphql_schema_no_auth(
    mocked_metadata_variables,
    mocked_metadata_column,
    mocked_metadata_all_tags,
    mocked_metadata_variable_tags,
):
    """Schema without the bypass_proposal_permission fixture, so permission
    checks run normally (and fail since there is no real request context)."""
    return strawberry.Schema(
        query=Query,
        subscription=Subscription,
        types=[DamnitVariable],
        directives=[lightweight],
        config=StrawberryConfig(auto_camel_case=False, scalar_map=SCALAR_MAP),
    )


@pytest.fixture
def graphql_schema_authenticated_non_member(mocker, graphql_schema_no_auth):
    """Schema where the user is authenticated but not a proposal member."""
    mocker.patch(
        "damnit_api.auth.permissions.IsAuthenticated.has_permission",
        new_callable=mocker.AsyncMock,
        return_value=True,
    )
    mocker.patch(
        "damnit_api.auth.permissions.IsProposalMember.has_permission",
        new_callable=mocker.AsyncMock,
        return_value=False,
    )
    return graphql_schema_no_auth
