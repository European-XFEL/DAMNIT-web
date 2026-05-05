"""Dependency type aliases for the auth module."""

from typing import Annotated

from authlib.integrations.starlette_client import StarletteOAuth2App
from fastapi import Depends

from ..shared.settings import settings
from .bootstrap import get_oauth_client
from .models import OAuthUserInfo as _OAuthUserInfo
from .models import User as _User


# TODO: Get from settings
def _get_default_redirect_login_uri(redirect_uri: str = "/app/home") -> str:
    return redirect_uri


RedirectURI = Annotated[str, Depends(_get_default_redirect_login_uri)]
"""Type alias for the redirect URI dependency."""

Client = Annotated[StarletteOAuth2App, Depends(get_oauth_client)]
"""Type alias for the OAuth client dependency."""


def get_optional_oauth_client() -> StarletteOAuth2App | None:
    """Return an OAuth client only when OAuth is the active auth backend."""
    if settings.auth.mode == "ldap":
        return None
    return get_oauth_client()


OptionalClient = Annotated[
    StarletteOAuth2App | None, Depends(get_optional_oauth_client)
]
"""Type alias for routes that also support LDAP/local debug sessions."""

OAuthUserInfo = Annotated[_OAuthUserInfo, Depends(_OAuthUserInfo.from_connection)]
"""Type alias for the OAuth user info dependency."""

User = Annotated[_User, Depends(_User.from_connection)]
"""Type alias for the full User dependency."""
