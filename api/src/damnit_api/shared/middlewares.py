from typing import TYPE_CHECKING

from fastapi.responses import RedirectResponse
from starlette.datastructures import URL

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Receive, Scope, Send

_LOCALHOST = "localhost"
_127 = "127.0.0.1"


class RedirectLocalhost127Middleware:
    """Middleware to redirect localhost to 127.0.0.1.

    Used if the UvicornSettings.localhost_to_127 is True.

    Useful for development as our dev Keycloak client only redirects to 127.0.0.1, not
    localhost.
    """

    def __init__(self, app: "ASGIApp") -> None:
        self.app = app

    async def __call__(self, scope: "Scope", receive: "Receive", send: "Send") -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        url = URL(scope=scope)
        if url.hostname == _LOCALHOST:
            url = url.replace(hostname=_127)
            response = RedirectResponse(url, status_code=307)
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
