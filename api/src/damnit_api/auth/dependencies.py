from typing import Annotated

from authlib.integrations.starlette_client import (  # type: ignore[import-untyped]
    StarletteOAuth2App,
)
from fastapi import Depends

from .bootstrap import get_oauth_client
from .models import OAuthUserInfo as _OuI
from .models import User as _Usr


# TODO: Get from settings
def _get_default_redirect_login_uri() -> str:
    return "/home"


RedirectURI = Annotated[str, Depends(_get_default_redirect_login_uri)]
"""Type alias for the redirect URI dependency."""

Client = Annotated[StarletteOAuth2App, Depends(get_oauth_client)]
"""Type alias for the OAuth client dependency."""

OAuthUserInfo = Annotated[_OuI, Depends(_OuI.from_request)]
"""Type alias for the OAuth user info dependency."""

User = Annotated[_Usr, Depends(_Usr.from_request)]
"""Type alias for the full User dependency."""
