"""Bootstrapping for the auth module."""

from typing import TYPE_CHECKING

from authlib.integrations.starlette_client import OAuth, StarletteOAuth2App

from .. import get_logger

logger = get_logger()

if TYPE_CHECKING:
    from ..shared.settings import AuthSettings, Settings


global __OAUTH

__OAUTH: OAuth = None  # type: ignore[assignment]


async def bootstrap(settings: "Settings"):
    """Bootstrap auth module - registers client defined in settings to [`.__OAUTH`] as
    `damnit_web` and sets [`damnit_api.auth.__CLIENT`] to [`.__OAUTH.damnit_web`]."""
    if settings.auth is None:
        await logger.awarning("Auth is disabled, skipping OAuth bootstrap")
        return

    import damnit_api.auth

    if settings.auth.mode == "ldap":
        await logger.ainfo("Using LDAP authentication backend")
        return

    if settings.auth.is_disabled:
        await logger.awarning(
            "Auth mode disables OAuth; skipping OAuth bootstrap",
            mode=settings.auth.mode,
        )
        return

    global __OAUTH
    __OAUTH = OAuth()

    if damnit_api.auth.__CLIENT is None:
        await logger.ainfo("Configuring OAuth client")
        _register(settings.auth)
        damnit_api.auth.__CLIENT = __OAUTH.damnit_web  # type: ignore[assignment, no-redef]
        try:
            await damnit_api.auth.__CLIENT.load_server_metadata()  # pyright: ignore[reportOptionalMemberAccess]
        except Exception as exc:
            # In debug, don't let an unreachable/invalid OIDC discovery endpoint
            # (e.g. missing TLS certificate) abort startup — let the operator
            # debug the rest of the app. Production still fails loudly.
            if not settings.debug:
                raise
            await logger.awarning(
                "Could not load OAuth server metadata; continuing because "
                "DW_API_DEBUG is true. OAuth login is unavailable until the "
                "discovery endpoint and its certificate are reachable.",
                server_metadata_url=str(settings.auth.server_metadata_url),
                error=str(exc),
            )
    else:
        await logger.awarning("OAuth client already configured")


def _register(auth: "AuthSettings"):
    """Register the OAuth client defined in settings to [`.__OAUTH`] as `damnit_web`."""
    global __OAUTH
    __OAUTH.register(
        name="damnit_web",
        client_id=auth.client_id,
        client_secret=auth.client_secret.get_secret_value(),
        server_metadata_url=str(auth.server_metadata_url),
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
