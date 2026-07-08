"""Typed application state and pure factory functions.

All long-lived runtime dependencies live on the frozen :class:`AppState`,
built once in the application lifespan and attached to ``app.state``. Each
field is produced by a pure ``create_*`` factory taking :class:`Settings`
(or already-built collaborators) as explicit arguments.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from litestar.datastructures import (
    State as LitestarState,  # noqa: TC002 - Litestar inspects annotations at runtime via get_type_hints
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from litestar.channels import ChannelsPlugin
    from sqlalchemy.ext.asyncio import AsyncSession

    from ._mymdc.clients import MyMdCClient
    from .auth.oauth import OAuthClient
    from .graphql.publisher import RunUpdatePublisher
    from .runs.repository import DamnitRepositoryRegistry
    from .shared.settings import Settings


@dataclass(frozen=True)
class AppState:
    # Session factory from the Advanced Alchemy config (main.py); held here
    # for non-request contexts (e.g. the proposal-membership guard).
    # Advanced Alchemy's create_session_maker() is typed as this Callable,
    # not as async_sessionmaker[AsyncSession] (its actual runtime type in
    # the non-routing case) - match its declared type here.
    db_sessionmaker: Callable[[], AsyncSession]
    mymdc_client: MyMdCClient
    oauth_client: OAuthClient | None  # None when auth is disabled
    repositories: DamnitRepositoryRegistry
    channels: ChannelsPlugin
    run_update_publisher: RunUpdatePublisher


def create_mymdc_client(settings: Settings) -> MyMdCClient:
    from ._mymdc import clients
    from ._mymdc.settings import MyMdCHTTPSettings, MyMdCMockSettings

    match settings.mymdc:
        case MyMdCHTTPSettings():
            auth = clients.MyMdCAuth.model_validate(settings.mymdc.model_dump())
            return clients.MyMdCClientAsync(auth)
        case MyMdCMockSettings():
            return clients.MyMdCClientMock.model_validate(settings.mymdc.model_dump())
        case _:
            msg = "Invalid MyMdC configuration"
            raise ValueError(msg)


def create_repositories() -> DamnitRepositoryRegistry:
    """Registry of per-proposal `DamnitRepository` objects (ADR-005).

    The SQLite backend is passed directly as the factory; its `metadata_ttl`
    keeps its default (see ADR-005 - TTLs are an implementation concern).
    """
    from .runs.repository import DamnitRepositoryRegistry
    from .runs.sqlite.repository import SQLiteDamnitRepository

    return DamnitRepositoryRegistry(SQLiteDamnitRepository)


def provide_app_state(state: LitestarState) -> AppState:
    """Litestar dependency: the application's :class:`AppState`."""
    return state.app_state  # type: ignore[attr-defined]
