"""Fixtures for the recorded end-to-end API tests.

Tests defined here should only interact with the app via HTTP, never python calls.

This conftest is the only place allowed to touch the app, and only via:

- the app factory (`damnit_api.main.create_app`), imported lazily inside a fixture
- `mint_session_cookie`, which forges the signed session cookie OAuth callback would set
  - This helper is deliberately coupled to the session implementation
  (Starlette `SessionMiddleware` over `itsdangerous`)
  - The framework-swap branch must update this one helper and nothing else

Outbound HTTP is recorded and replayed with pytest-recording. Cassettes stored in
`cassettes/<module>/<test>.yaml` next to this package.

Secrets should **never** be stored in the cassettes, if you modify the tests you should
check this before committing files. In theory, the `vcr_config` filters strip auth
headers and OAuth client credentials at record time, but you should still check.
"""

import base64
import json

import httpx
import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from itsdangerous import TimestampSigner

SESSION_COOKIE = "session"

TEST_USER = {
    "email": "e2e-tester@example.org",
    "family_name": "Tester",
    "given_name": "E2e",
    "groups": [],
    "name": "E2e Tester",
    "preferred_username": "e2etester",
    "sub": "00000000-0000-0000-0000-000000000000",
}


@pytest.fixture(scope="session")
def vcr_config():
    return {
        # Only OUTBOUND calls belong on tape; requests to the app itself must hit the
        # live ASGI app
        "ignore_hosts": ["testserver"],
        "filter_headers": ["authorization", "cookie", "set-cookie"],
        "filter_post_data_parameters": ["client_secret", "client_id"],
        "decode_compressed_response": True,
    }


@pytest.fixture(autouse=True)
def _reset_auth_bootstrap():
    """Reset the OAuth client cached in a module-level global.

    !!! warning

        Without this, only the first test's startup performs the OIDC discovery fetch
        and later cassettes cannot replay standalone.
    """
    import damnit_api.auth

    damnit_api.auth.__CLIENT = None
    yield
    damnit_api.auth.__CLIENT = None


@pytest_asyncio.fixture
async def e2e_client(vcr):
    """HTTPX client for the ASGI app.

    Depends on the `vcr` fixture so the cassette is active while the lifespan runs. App
    startup performs the OIDC discovery fetch.
    """
    from damnit_api.main import create_app

    app = create_app()
    async with LifespanManager(app) as manager:
        transport = httpx.ASGITransport(app=manager.app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            yield client


@pytest_asyncio.fixture
async def logged_in_client(e2e_client):  # noqa: RUF029 - must be async to receive the async fixture
    """ASGI client with new login session cookie."""
    e2e_client.cookies.update(mint_session_cookie())
    return e2e_client


def mint_session_cookie(user: dict | None = None) -> dict[str, str]:
    """Forge the signed session cookie a completed OAuth login would set.

    !!! warning

        This bypasses awkward OAuth internals (redirects, callbacks, etc...) while
        keeping the key real session path: value is signed with the app's own session
        secret, same as how as Starlette's `SessionMiddleware` does.
    """
    from damnit_api.shared.settings import settings

    secret = settings.session_secret.get_secret_value()  # pyright: ignore[reportOptionalMemberAccess]
    payload = base64.b64encode(json.dumps({"user": user or TEST_USER}).encode("utf-8"))
    return {SESSION_COOKIE: TimestampSigner(secret).sign(payload).decode("utf-8")}
