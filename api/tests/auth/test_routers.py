import base64
import json

import pytest
from fastapi.responses import RedirectResponse
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner

from damnit_api.auth.bootstrap import get_oauth_client
from damnit_api.auth.routers import _sanitize_redirect_target
from damnit_api.main import create_app
from damnit_api.shared.settings import settings

USER = {"sub": "tester", "email": "tester@example.org", "name": "Tester"}
PROPOSAL_PAGE = "/app/proposal/6996?x=run&y=pulses"


class FakeOAuthClient:
    """XFEL SSO, answering at once with a signed-in user."""

    async def authorize_redirect(self, request, redirect_uri):
        return RedirectResponse("https://sso.example.org/authorize")

    async def authorize_access_token(self, request):
        return {"access_token": "token"}

    async def userinfo(self, token):
        return USER


@pytest.fixture
def client(monkeypatch):
    async def noop_bootstrap(settings):
        pass

    monkeypatch.setattr("damnit_api.auth.bootstrap", noop_bootstrap)

    app = create_app()
    app.dependency_overrides[get_oauth_client] = FakeOAuthClient
    with TestClient(app, follow_redirects=False) as client:
        yield client


def signed_in(client):
    secret = settings.session_secret.get_secret_value()  # pyright: ignore[reportOptionalMemberAccess]
    payload = base64.b64encode(json.dumps({"user": USER}).encode())
    client.cookies.set("session", TimestampSigner(secret).sign(payload).decode())
    return client


@pytest.mark.parametrize(
    "target",
    ["/app/proposal/6996", "/app/proposal/6996?x=run&y=pulses", "/app/home"],
)
def test_a_path_on_the_site_is_kept(target):
    assert _sanitize_redirect_target(target) == target


@pytest.mark.parametrize(
    "target",
    [
        None,
        "",
        "https://evil.example/app/home",
        "//evil.example",
        "/\\evil.example",
        "/\t/evil.example",
        "app/home",
    ],
)
def test_anything_else_lands_on_the_home_page(target):
    assert _sanitize_redirect_target(target) == "/app/home"


def test_a_signed_out_login_returns_to_the_page_it_was_given(client):
    login = client.get("/oauth/login", params={"redirect_uri": PROPOSAL_PAGE})
    assert login.headers["location"] == "https://sso.example.org/authorize"

    callback = client.get("/oauth/callback", params={"code": "c", "state": "s"})

    assert callback.status_code == 307
    assert callback.headers["location"] == PROPOSAL_PAGE


def test_a_signed_in_login_goes_straight_to_the_page(client):
    response = signed_in(client).get(
        "/oauth/login", params={"redirect_uri": PROPOSAL_PAGE}
    )

    assert response.status_code == 307
    assert response.headers["location"] == PROPOSAL_PAGE
