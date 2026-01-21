"""Bootstrapping for the auth module."""

from typing import TYPE_CHECKING

from authlib.integrations.starlette_client import OAuth, StarletteOAuth2App

from .. import get_logger

logger = get_logger()

if TYPE_CHECKING:
    from ..shared.settings import Settings


global __OAUTH

__OAUTH: OAuth = None  # type: ignore[assignment]


async def bootstrap(settings: "Settings"):
    """Bootstrap auth module - registers client defined in settings to [`.__OAUTH`] as
    `damnit_web` and sets [`damnit_api.auth.__CLIENT`] to [`.__OAUTH.damnit_web`]."""
    import damnit_api.auth

    global __OAUTH
    __OAUTH = OAuth()

    if damnit_api.auth.__CLIENT is None:
        await logger.ainfo("Configuring OAuth client")
        _register(settings)
        damnit_api.auth.__CLIENT = __OAUTH.damnit_web  # type: ignore[assignment, no-redef]
        await damnit_api.auth.__CLIENT.load_server_metadata()  # pyright: ignore[reportOptionalMemberAccess]
    else:
        await logger.awarning("OAuth client already configured")


def _register(settings: "Settings"):
    """Register the OAuth client defined in settings to [`.__OAUTH`] as `damnit_web`."""
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

    Raises:
        RuntimeError: If the OAuth client has not been initialized.
    """
    from damnit_api import auth

    if auth.__CLIENT is None:
        msg = (
            "OAuth client has not been initialized. Call "
            "[`damnit_api.auth.bootstrap.bootstrap()`] first."
        )
        raise RuntimeError(msg)
    return auth.__CLIENT
