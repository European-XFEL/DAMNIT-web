from pathlib import Path
from types import SimpleNamespace

import pytest
import pytest_asyncio
import strawberry
from strawberry.schema.config import StrawberryConfig

from damnit_api.graphql.directives import lightweight
from damnit_api.graphql.publisher import SqlitePollingRunUpdatePublisher
from damnit_api.graphql.queries import Query
from damnit_api.graphql.subscriptions import Subscription
from damnit_api.runs.csv import CsvDamnitRepository
from damnit_api.runs.repository import DamnitRepositoryRegistry
from damnit_api.runs.types import SCALAR_MAP, DamnitVariable


class SchemaWithContext:
    """Wraps a Strawberry Schema and injects a default context_value.

    An explicit `context_value` at the call site still wins.
    """

    def __init__(self, schema, default_context) -> None:
        self._schema = schema
        self._context = default_context

    async def execute(self, query, *, context_value=None, variable_values=None):
        ctx = context_value if context_value is not None else self._context
        return await self._schema.execute(
            query, context_value=ctx, variable_values=variable_values
        )

    async def subscribe(self, query, *, context_value=None, variable_values=None):
        ctx = context_value if context_value is not None else self._context
        return await self._schema.subscribe(
            query, context_value=ctx, variable_values=variable_values
        )


@pytest_asyncio.fixture
async def channels_plugin():
    from litestar.channels import ChannelsPlugin
    from litestar.channels.backends.memory import MemoryChannelsBackend

    plugin = ChannelsPlugin(
        backend=MemoryChannelsBackend(), arbitrary_channels_allowed=True
    )
    async with plugin:
        yield plugin


def make_publisher(channels_plugin, repositories, **kwargs):
    """A fast-ticking SQLite polling publisher for subscription tests."""
    kwargs.setdefault("interval", 0.01)
    return SqlitePollingRunUpdatePublisher(
        channels=channels_plugin, repositories=repositories, **kwargs
    )


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


@pytest.fixture
def mocked_ensure_damnit_path(mocker):
    """Bypass the damnit_path validation; tests run without a request context."""
    mocker.patch(
        "damnit_api.graphql.queries._ensure_damnit_path",
        return_value=None,
    )


@pytest.fixture
def csv_fixture_dir() -> Path:
    """Path to the graphql test CSV fixture files."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def mock_repositories(csv_fixture_dir):
    """A repository registry backed by CsvDamnitRepository over the fixtures."""
    return DamnitRepositoryRegistry(
        lambda proposal: CsvDamnitRepository(proposal, csv_fixture_dir)
    )


@pytest.fixture
def graphql_context(mock_repositories):
    return SimpleNamespace(
        repositories=mock_repositories,
        oauth_user=None,
    )


@pytest.fixture
def graphql_schema_no_auth(graphql_context):
    """Schema without permission bypass, so permission checks run normally."""
    schema = strawberry.Schema(
        query=Query,
        subscription=Subscription,
        types=[DamnitVariable],
        directives=[lightweight],
        config=StrawberryConfig(auto_camel_case=False, scalar_map=SCALAR_MAP),
    )
    return SchemaWithContext(schema, graphql_context)


@pytest.fixture
def graphql_schema(
    bypass_proposal_permission,
    mocked_ensure_damnit_path,
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
