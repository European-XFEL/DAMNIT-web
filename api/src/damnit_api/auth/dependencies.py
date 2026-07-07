"""Dependency type aliases for the auth module."""

from typing import Annotated

from authlib.integrations.starlette_client import StarletteOAuth2App
from fastapi import Depends, Request

from ..state import get_app_state
from .models import OAuthUserInfo as _OAuthUserInfo
from .models import User as _User


# TODO: Get from settings
def _get_default_redirect_login_uri() -> str:
    return "/app/home"


def get_oauth_client(request: Request) -> StarletteOAuth2App:
    """Provide the OAuth client from the application state.

    Raises:
        RuntimeError: If auth is disabled and no client was built.
    """
    client = get_app_state(request).oauth_client
    if client is None:
        msg = "OAuth client is not configured (auth is disabled)."
        raise RuntimeError(msg)
    return client


RedirectURI = Annotated[str, Depends(_get_default_redirect_login_uri)]
"""Type alias for the redirect URI dependency."""

Client = Annotated[StarletteOAuth2App, Depends(get_oauth_client)]
"""Type alias for the OAuth client dependency."""

OAuthUserInfo = Annotated[_OAuthUserInfo, Depends(_OAuthUserInfo.from_connection)]
"""Type alias for the OAuth user info dependency."""

User = Annotated[_User, Depends(_User.from_connection)]
"""Type alias for the full User dependency."""
