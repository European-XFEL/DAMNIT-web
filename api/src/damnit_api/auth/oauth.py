"""OAuth2/OIDC client configuration.

Owned by the auth slice; the composition root builds it via
`create_oauth_client` and holds it on `AppState`.
"""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..shared.settings import Settings

# Session cookie name, shared by `main.py`'s session config and the logout
# handlers in `auth/routers.py` so the two cannot drift.
SESSION_COOKIE_KEY = "session"


@dataclass
class OAuthClient:
    """OAuth2/OIDC client configuration with lazily loaded server metadata."""

    client_id: str
    client_secret: str
    scope: str
    server_metadata_url: str
    server_metadata: dict = field(default_factory=dict)

    async def load_server_metadata(self) -> None:
        import httpx

        async with httpx.AsyncClient() as http:
            resp = await http.get(self.server_metadata_url)
            resp.raise_for_status()
            self.server_metadata = resp.json()


def create_oauth_client(settings: "Settings") -> OAuthClient | None:
    if settings.auth is None:
        return None

    return OAuthClient(
        client_id=settings.auth.client_id,
        client_secret=settings.auth.client_secret.get_secret_value(),
        scope="openid email groups",
        server_metadata_url=str(settings.auth.server_metadata_url),
    )
