"""Dependency type aliases for the auth module."""

from typing import Annotated

from authlib.integrations.starlette_client import StarletteOAuth2App
from fastapi import Depends

from .bootstrap import get_oauth_client
from .models import OAuthUserInfo as _OAuthUserInfo
from .models import User as _User


# TODO: Get from settings
def _get_default_redirect_login_uri() -> str:
    return "/home"


RedirectURI = Annotated[str, Depends(_get_default_redirect_login_uri)]
"""Type alias for the redirect URI dependency."""

Client = Annotated[StarletteOAuth2App, Depends(get_oauth_client)]
"""Type alias for the OAuth client dependency."""

OAuthUserInfo = Annotated[_OAuthUserInfo, Depends(_OAuthUserInfo.from_request)]
"""Type alias for the OAuth user info dependency."""

User = Annotated[_User, Depends(_User.from_request)]
"""Type alias for the full User dependency."""
