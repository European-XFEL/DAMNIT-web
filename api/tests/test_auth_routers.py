"""Tests for the OAuth2 flow in `auth/routers.py`."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from litestar.di import Provide
from litestar.middleware.session.server_side import ServerSideSessionConfig
from litestar.testing import create_test_client

from damnit_api.auth.oauth import SESSION_COOKIE_KEY, OAuthClient
from damnit_api.auth.routers import OAuthController
from damnit_api.auth.token_store import InMemoryTokenStore

SERVER_METADATA = {
    "authorization_endpoint": "https://idp.example/authorize",
    "token_endpoint": "https://idp.example/token",
    "userinfo_endpoint": "https://idp.example/userinfo",
    "revocation_endpoint": "https://idp.example/revoke",
    "end_session_endpoint": "https://idp.example/logout",
}

USERINFO = {
    "sub": "user-1",
    "email": "user@example.com",
    "family_name": "User",
    "given_name": "Test",
    "groups": [],
    "name": "Test User",
    "preferred_username": "tuser",
}


def _oauth_config() -> OAuthClient:
    return OAuthClient(
        client_id="test-client",
        client_secret="test-secret",  # noqa: S106
        scope="openid email groups",
        server_metadata_url="https://idp.example/.well-known/openid-configuration",
        server_metadata=dict(SERVER_METADATA),
    )


@pytest.fixture
def token_store():
    return InMemoryTokenStore()


@pytest.fixture
def session_config():
    return ServerSideSessionConfig(key=SESSION_COOKIE_KEY)


@pytest.fixture
def client(token_store, session_config):
    # oauth_config/token_store are app-level dependencies in the composition
    # root (main.py); provide fakes at the same layer here.
    with create_test_client(
        route_handlers=[OAuthController],
        dependencies={
            "oauth_config": Provide(_oauth_config, sync_to_thread=False),
            "token_store": Provide(lambda: token_store, sync_to_thread=False),
        },
        session_config=session_config,
        middleware=[session_config.middleware],
    ) as c:
        yield c


@pytest.fixture
def mock_oauth_client():
    """Patch authlib's AsyncOAuth2Client so no real HTTP is exchanged."""
    with patch("authlib.integrations.httpx_client.AsyncOAuth2Client") as cls:
        instance = MagicMock()
        instance.create_authorization_url = MagicMock(
            return_value=("https://idp.example/authorize?...", "csrf-state")
        )
        instance.fetch_token = AsyncMock(
            return_value={
                "access_token": "tok123",
                "refresh_token": "ref456",
                "id_token": "idtok789",
            }
        )
        userinfo_resp = MagicMock()
        userinfo_resp.raise_for_status = MagicMock()
        userinfo_resp.json = MagicMock(return_value=dict(USERINFO))
        instance.get = AsyncMock(return_value=userinfo_resp)
        instance.post = AsyncMock()
        instance.aclose = AsyncMock()
        cls.return_value = instance
        yield instance


# ── /oauth/callback ──────────────────────────────────────────────────────────


def test_callback_state_mismatch_returns_401(client):
    client.set_session_data({"_oauth_state": "correct-state"})

    resp = client.get("/oauth/callback", params={"state": "wrong-state", "code": "abc"})

    assert resp.status_code == 401


def test_callback_success_stores_session_user_and_token(
    client, token_store, mock_oauth_client
):
    client.set_session_data({"_oauth_state": "csrf-state"})

    resp = client.get(
        "/oauth/callback",
        params={"state": "csrf-state", "code": "abc"},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert resp.headers["location"] == "/app/home"

    session = client.get_session_data()
    assert session["user"]["sub"] == "user-1"

    assert token_store.pop_token_field("user-1", "access_token") == "tok123"
    assert token_store.pop_token_field("user-1", "refresh_token") == "ref456"


# ── /oauth/logout ────────────────────────────────────────────────────────────


def test_logout_revokes_tokens_and_clears_session_cookie(
    client, token_store, mock_oauth_client
):
    token_store.store(
        "user-1",
        {"access_token": "tok123", "refresh_token": "ref456", "id_token": "idtok789"},
    )
    client.set_session_data({"user": {"sub": "user-1"}})

    resp = client.post("/oauth/logout")

    assert resp.status_code == 201
    assert resp.json()["logout_url"].startswith("https://idp.example/logout")

    # Both refresh and access tokens are revoked via the TokenStore.
    assert mock_oauth_client.post.await_count == 2
    assert token_store.pop_token_field("user-1", "access_token") is None
    assert token_store.pop_token_field("user-1", "refresh_token") is None

    # The session cookie is cleared, keyed by the shared session cookie name.
    set_cookie = resp.headers.get("set-cookie", "")
    assert f"{SESSION_COOKIE_KEY}=" in set_cookie
    assert "Max-Age=0" in set_cookie

    assert "user" not in client.get_session_data()


# ── x-forwarded-host trust gate ──────────────────────────────────────────────


def test_forwarded_host_ignored_when_untrusted(client, mock_oauth_client):
    resp = client.get(
        "/oauth/login",
        params={"redirect_uri": "/app/home"},
        headers={"x-forwarded-host": "evil.example"},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    callback_uri = mock_oauth_client.create_authorization_url.call_args.kwargs[
        "redirect_uri"
    ]
    assert "evil.example" not in callback_uri


def test_forwarded_host_honoured_when_trusted(client, mock_oauth_client, monkeypatch):
    from damnit_api.shared import settings as settings_module

    monkeypatch.setattr(settings_module.settings, "trust_forwarded_host", True)

    resp = client.get(
        "/oauth/login",
        params={"redirect_uri": "/app/home"},
        headers={"x-forwarded-host": "proxy.example"},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    callback_uri = mock_oauth_client.create_authorization_url.call_args.kwargs[
        "redirect_uri"
    ]
    assert "proxy.example" in callback_uri


# ── post-login redirect allow-list ───────────────────────────────────────────


def test_login_rejects_absolute_redirect_target(client, mock_oauth_client):
    client.set_session_data({"user": dict(USERINFO)})

    resp = client.get(
        "/oauth/login",
        params={"redirect_uri": "https://evil.example/phish"},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert resp.headers["location"] == "/app/home"


def test_login_rejects_protocol_relative_redirect_target(client, mock_oauth_client):
    client.set_session_data({"user": dict(USERINFO)})

    resp = client.get(
        "/oauth/login",
        params={"redirect_uri": "//evil.example/phish"},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert resp.headers["location"] == "/app/home"


def test_relative_redirect_carried_through_login_and_callback(
    client, token_store, mock_oauth_client
):
    resp = client.get(
        "/oauth/login",
        params={"redirect_uri": "/proposal/1234"},
        follow_redirects=False,
    )

    assert resp.status_code == 302  # off to the IdP
    assert client.get_session_data()["_login_redirect"] == "/proposal/1234"

    resp = client.get(
        "/oauth/callback",
        params={"state": "csrf-state", "code": "abc"},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert resp.headers["location"] == "/proposal/1234"


def test_callback_sanitizes_redirect_carried_in_session(
    client, token_store, mock_oauth_client
):
    client.set_session_data(
        {
            "_oauth_state": "csrf-state",
            "_login_redirect": "https://evil.example/phish",
        }
    )

    resp = client.get(
        "/oauth/callback",
        params={"state": "csrf-state", "code": "abc"},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert resp.headers["location"] == "/app/home"


# ── websocket session auth (websockets authenticate identically to HTTP) ─────


def _ws_echo_user_handler():
    from litestar import websocket
    from litestar.connection import WebSocket

    from damnit_api.auth.models import OAuthUserInfo

    @websocket("/ws")
    async def ws_handler(socket: WebSocket) -> None:
        await socket.accept()
        user = OAuthUserInfo.from_connection(socket)
        await socket.send_json({"email": user.email})
        await socket.close()

    return ws_handler


def test_websocket_resolves_user_from_session(session_config):
    with create_test_client(
        route_handlers=[_ws_echo_user_handler()],
        session_config=session_config,
        middleware=[session_config.middleware],
    ) as c:
        c.set_session_data({"user": dict(USERINFO)})
        with c.websocket_connect("/ws") as ws:
            assert ws.receive_json() == {"email": "user@example.com"}


def test_websocket_without_session_user_is_rejected(session_config):
    from litestar.exceptions import WebSocketDisconnect

    with create_test_client(
        route_handlers=[_ws_echo_user_handler()],
        session_config=session_config,
        middleware=[session_config.middleware],
    ) as c, pytest.raises(WebSocketDisconnect), c.websocket_connect("/ws") as ws:
        ws.receive_json()
