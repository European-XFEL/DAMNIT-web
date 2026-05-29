from fastapi.testclient import TestClient

from damnit_api.main import create_app


def test_oauth_login_creates_debug_session_in_ldap_local_mode():
    """The existing frontend login button should work in HZDR debug mode."""
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
