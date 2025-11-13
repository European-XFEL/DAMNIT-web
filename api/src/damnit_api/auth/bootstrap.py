"""Bootstrapping for the auth module."""

from typing import TYPE_CHECKING

from authlib.integrations.starlette_client import (  # type: ignore[import-untyped]
    OAuth,  # type: ignore[import-untyped]
    StarletteOAuth2App,
)

from .. import get_logger

logger = get_logger(__name__)

if TYPE_CHECKING:
    from ..shared.settings import Settings


global __OAUTH

__OAUTH: OAuth = None  # type: ignore[assignment]


async def bootstrap(settings: "Settings"):
    await logger.ainfo("Bootstrapping auth module", settings=settings)
    import damnit_api.auth

    global __OAUTH
    __OAUTH = OAuth()

    if damnit_api.auth.__CLIENT is None:
        await logger.ainfo("Configuring OAuth client")
        _register(settings)
        damnit_api.auth.__CLIENT = __OAUTH.damnit_web  # type: ignore[assignment, no-redef]
    else:
        await logger.awarning("OAuth client already configured")


def _register(settings: "Settings"):
    global __OAUTH
    __OAUTH.register(
        name="damnit_web",
        client_id=settings.auth.client_id,
        client_secret=settings.auth.client_secret.get_secret_value(),
        server_metadata_url=str(settings.auth.server_metadata_url),
        client_kwargs={"scope": "openid email groups"},
    )


def get_oauth_client() -> StarletteOAuth2App:
    """Get the global OAuth client instance - for use with fastapi dependencies.

    Returns:
        The global OAuth client.
    """
    from damnit_api import auth

    if auth.__CLIENT is None:
        msg = "OAuth client has not been initialized. Call configure() first."
        raise RuntimeError(msg)
    return auth.__CLIENT
