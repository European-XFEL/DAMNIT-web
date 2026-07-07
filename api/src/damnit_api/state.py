"""Typed application state and pure factory functions.

All long-lived runtime dependencies live on the frozen :class:`AppState`,
built once in the application lifespan and attached to ``app.state``. Each
field is produced by a pure ``create_*`` factory taking :class:`Settings`
(or already-built collaborators) as explicit arguments.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import (
    Request,  # noqa: TC002 - FastAPI DI inspects annotations at runtime
)
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

if TYPE_CHECKING:
    from authlib.integrations.starlette_client import StarletteOAuth2App

    from ._mymdc.clients import MyMdCClient
    from .auth.token_store import TokenStore
    from .shared.settings import Settings


@dataclass(frozen=True)
class AppState:
    db_engine: AsyncEngine
    db_sessionmaker: async_sessionmaker[AsyncSession]
    mymdc_client: MyMdCClient
    oauth_client: StarletteOAuth2App | None  # None when auth is disabled
    token_store: TokenStore


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


def create_oauth_client(settings: Settings) -> StarletteOAuth2App | None:
    if settings.auth is None:
        return None

    from authlib.integrations.starlette_client import OAuth

    oauth = OAuth()
    oauth.register(
        name="damnit_web",
        client_id=settings.auth.client_id,
        client_secret=settings.auth.client_secret.get_secret_value(),
        server_metadata_url=str(settings.auth.server_metadata_url),
        client_kwargs={"scope": "openid email groups"},
    )
    return oauth.damnit_web  # pyright: ignore[reportReturnType]


def create_token_store() -> TokenStore:
    from .auth.token_store import InMemoryTokenStore

    return InMemoryTokenStore()


def get_app_state(request: Request) -> AppState:
    """FastAPI dependency: the application's :class:`AppState`."""
    return request.app.state.app_state
