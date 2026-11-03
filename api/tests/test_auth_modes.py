import pytest
from fastapi.testclient import TestClient

from damnit_api.main import create_app
from damnit_api.shared.settings import AuthSettings, settings


def test_oauth_login_creates_debug_session_in_ldap_local_mode(monkeypatch):
    """The existing frontend login button should work in HZDR debug mode.

    Pinned to a server_url-less AuthSettings rather than relying on whatever
    api/.env happens to configure locally (e.g. a real LDAP server for
    manual/production-style verification) - see the isolation note on
    test_runtime_config.test_runtime_config_defaults_to_hzdr_terms.
    """
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="ldap"))
    with TestClient(create_app(), follow_redirects=False) as client:
        login_response = client.get("/oauth/login?redirect_uri=/home")

        assert login_response.status_code == 307
        assert login_response.headers["location"] == "/home"

        user_response = client.get("/oauth/userinfo")

    assert user_response.status_code == 200
    payload = user_response.json()
    assert payload["preferred_username"] == "hzdr-dev"
    assert payload["proposals_by_year_half"] == {}


def test_hzdr_emulator_event_append_requires_login():
    """Local emulator writes must still require an authenticated session."""
    with TestClient(create_app(), follow_redirects=False) as client:
        response = client.post("/metadata/hzdr/emulator/events", json={})

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_without_mymdc_a_non_local_user_is_member_of_nothing(monkeypatch):
    """An LDAP deployment with no MyMdC (no damnit_path) cannot look up
    proposal membership: the user gets none instead of a crash, so a proposal
    query is answered "forbidden" rather than "could not verify"."""
    import pytest

    from damnit_api.auth.models import OAuthUserInfo, User
    from damnit_api.metadata.services import _check_user_allowed
    from damnit_api.shared.errors import ForbiddenError

    monkeypatch.setattr(settings, "damnit_path", None)
    oauth = OAuthUserInfo(
        email="tippey27@example.org",
        family_name="T",
        given_name="K",
        groups=[],
        name="K T",
        preferred_username="tippey27",
    )

    user = await User.from_oauth_user(None, None, oauth)  # pyright: ignore[reportArgumentType]

    assert user.proposals == []
    assert user.proposals_by_year_half.root == {}
    with pytest.raises(ForbiddenError):
        await _check_user_allowed(6996, user)
