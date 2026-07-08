"""Dependency functions and type aliases for the auth module."""

from collections.abc import AsyncIterator

from authlib.integrations import httpx_client
from authlib.integrations.httpx_client import AsyncOAuth2Client
from litestar import Request
from litestar.datastructures import State
from sqlmodel.ext.asyncio.session import AsyncSession

from .._mymdc.dependencies import MyMdCClient
from .models import OAuthUserInfo as _OAuthUserInfo
from .models import User as _User
from .oauth import OAuthClient


def get_oauth_client(state: State) -> OAuthClient:
    client = state.app_state.oauth_client  # type: ignore[attr-defined]
    if client is None:
        msg = (
            "OAuth client is not configured (settings.auth is None); "
            "enable auth settings to use OAuth endpoints."
        )
        raise RuntimeError(msg)
    return client


async def get_oauth_http_client(
    oauth_config: OAuthClient,
) -> AsyncIterator[AsyncOAuth2Client]:
    """Litestar dependency: a short-lived OAuth2 HTTP client, closed by DI."""
    client = httpx_client.AsyncOAuth2Client(
        client_id=oauth_config.client_id,
        client_secret=oauth_config.client_secret,
        scope=oauth_config.scope,
    )
    try:
        yield client
    finally:
        await client.aclose()


def get_oauth_user_info(request: Request) -> _OAuthUserInfo:
    """Litestar dependency: resolve OAuthUserInfo from the session."""
    return _OAuthUserInfo.from_connection(request)  # type: ignore[arg-type]


async def get_user(
    request: Request,
    mymdc: MyMdCClient,
    session: AsyncSession,
) -> _User:
    """Litestar dependency: resolve full User (with proposals) from session + DB."""
    return await _User.from_connection(request, mymdc, session)  # type: ignore[arg-type]


# Plain type re-exports; consumed by other modules as annotations.
OAuthUserInfo = _OAuthUserInfo
User = _User
