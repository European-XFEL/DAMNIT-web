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
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

if TYPE_CHECKING:
    from ._mymdc.clients import MyMdCClient
    from .auth.oauth import OAuthClient
    from .auth.token_store import TokenStore
    from .graphql.subscriptions import SubscriptionCursors
    from .runs.repository import DamnitRepositoryRegistry
    from .shared.settings import Settings


@dataclass(frozen=True)
class AppState:
    db_engine: AsyncEngine
    db_sessionmaker: async_sessionmaker[AsyncSession]
    mymdc_client: MyMdCClient
    oauth_client: OAuthClient | None  # None when auth is disabled
    token_store: TokenStore
    repositories: DamnitRepositoryRegistry
    subscription_cursors: SubscriptionCursors


def create_db_engine(settings: Settings) -> AsyncEngine:
    db_url = f"sqlite+aiosqlite:///{settings.db_path}"
    return create_async_engine(db_url, echo=False, future=True)


def create_db_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


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


def create_token_store() -> TokenStore:
    from .auth.token_store import InMemoryTokenStore

    return InMemoryTokenStore()


def create_repositories() -> DamnitRepositoryRegistry:
    """Registry of per-proposal `DamnitRepository` objects (ADR-005).

    The SQLite backend is passed directly as the factory; its `metadata_ttl`
    keeps its default (see ADR-005 - TTLs are an implementation concern).
    """
    from .runs.repository import DamnitRepositoryRegistry
    from .runs.sqlite.repository import SQLiteDamnitRepository

    return DamnitRepositoryRegistry(SQLiteDamnitRepository)


def create_subscription_cursors() -> SubscriptionCursors:
    from .graphql.subscriptions import SubscriptionCursors

    return SubscriptionCursors()


def provide_app_state(state: LitestarState) -> AppState:
    """Litestar dependency: the application's :class:`AppState`."""
    return state.app_state  # type: ignore[attr-defined]
