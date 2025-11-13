from authlib.integrations.starlette_client import (  # type: ignore[import-untyped]
    StarletteOAuth2App,
)

from .bootstrap import bootstrap as bootstrap
from .routers import router

global __CLIENT

__CLIENT: StarletteOAuth2App = None  # type: ignore[assignment]
"""Global/singleton OAuth client instance."""


__all__ = ["bootstrap", "router"]
