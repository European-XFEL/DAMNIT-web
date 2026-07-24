from copy import deepcopy

import pytest
import strawberry
from strawberry.schema.config import StrawberryConfig

from damnit_api.graphql import subscriptions
from damnit_api.graphql.directives import lightweight
from damnit_api.graphql.metadata import fetch_metadata
from damnit_api.graphql.queries import Query
from damnit_api.graphql.subscriptions import Subscription, poll_proposal
from damnit_api.runs.types import SCALAR_MAP, Cell

from .const import (
    EXAMPLE_TAGS,
    EXAMPLE_VARIABLE_TAGS,
    EXAMPLE_VARIABLES,
    RUN_IDENTIFIERS,
)


@pytest.fixture(autouse=True)
def reset_caches():
    fetch_metadata.cache_clear()
    poll_proposal.cache_clear()
    subscriptions._last_seen_timestamp.clear()
    subscriptions._last_run_added_at.clear()
    return


def _patch_permissions(mocker, *, authenticated: bool, member: bool) -> None:
    mocker.patch(
        "damnit_api.auth.permissions.IsAuthenticated.has_permission",
        new_callable=mocker.AsyncMock,
        return_value=authenticated,
    )
    mocker.patch(
        "damnit_api.auth.permissions.IsProposalMember.has_permission",
        new_callable=mocker.AsyncMock,
        return_value=member,
    )


@pytest.fixture
def bypass_proposal_permission(mocker):
    """Bypass all proposal permission checks so tests focus on resolver logic."""
    _patch_permissions(mocker, authenticated=True, member=True)


# `fetch_metadata` folds tags into variables and variables into tags by
# mutating what it reads. The real db builds those maps afresh from each query,
# so hand out a copy per call; returning the constant itself lets one call's
# edits pile up in the next one's result.
def _fresh(mocker, target, value):
    mocker.patch(target, side_effect=lambda *args, **kwargs: deepcopy(value))


@pytest.fixture
def mocked_metadata_variables(mocker):
    _fresh(mocker, "damnit_api.graphql.metadata.db.async_variables", EXAMPLE_VARIABLES)


@pytest.fixture
def mocked_metadata_all_tags(mocker):
    _fresh(mocker, "damnit_api.graphql.metadata.db.async_all_tags", EXAMPLE_TAGS)


@pytest.fixture
def mocked_metadata_variable_tags(mocker):
    _fresh(
        mocker,
        "damnit_api.graphql.metadata.db.async_variable_tags",
        EXAMPLE_VARIABLE_TAGS,
    )


@pytest.fixture
def mocked_metadata_run_identifiers(mocker):
    return mocker.patch(
        "damnit_api.graphql.metadata.db.async_run_identifiers",
        return_value=RUN_IDENTIFIERS,
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
def graphql_schema_no_auth(
    mocked_metadata_variables,
    mocked_metadata_run_identifiers,
    mocked_metadata_all_tags,
    mocked_metadata_variable_tags,
):
    """Schema without the bypass_proposal_permission fixture, so permission
    checks run normally (and fail since there is no real request context)."""
    return strawberry.Schema(
        query=Query,
        subscription=Subscription,
        types=[Cell],
        directives=[lightweight],
        config=StrawberryConfig(auto_camel_case=False, scalar_map=SCALAR_MAP),
    )


@pytest.fixture
def graphql_schema(
    bypass_proposal_permission,
    mocked_ensure_damnit_path,
    mocked_metadata_max,
    graphql_schema_no_auth,
):
    """Same schema as graphql_schema_no_auth, with permission and damnit-path
    checks bypassed so tests exercise resolver logic only."""
    return graphql_schema_no_auth


@pytest.fixture
def graphql_schema_authenticated_non_member(mocker, graphql_schema_no_auth):
    """Schema where the user is authenticated but not a proposal member."""
    _patch_permissions(mocker, authenticated=True, member=False)
    return graphql_schema_no_auth
