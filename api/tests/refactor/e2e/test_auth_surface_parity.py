"""Check that the auth HTTP behaves the same during the refactor.

Requests are made to the real app over plain HTTP.

!!! warning

    Session establishment is faked with a minted cookie (see conftest).
"""

from urllib.parse import urlsplit

import pytest

from .conftest import TEST_USER

pytestmark = [pytest.mark.vcr, pytest.mark.asyncio]


async def test_login_redirects_to_oidc_provider_unchanged(e2e_client):
    from damnit_api.shared.settings import settings

    # Fork: a local HZDR api/.env configures LDAP and leaves the OIDC provider
    # at its localhost default; CI sets DW_API_AUTH__SERVER_METADATA_URL.
    metadata_url = str(settings.auth.server_metadata_url) if settings.auth else ""
    if urlsplit(metadata_url).hostname in {None, "localhost", "127.0.0.1"}:
        pytest.skip("needs an OIDC provider (DW_API_AUTH__SERVER_METADATA_URL)")

    response = await e2e_client.get("/oauth/login")

    assert response.status_code == 302
    location = response.headers["location"]
    assert "response_type=code" in location
    assert "scope=openid+email+groups" in location
    assert "redirect_uri=" in location


async def test_userinfo_without_proposals_wire_shape_unchanged(logged_in_client):
    response = await logged_in_client.get(
        "/oauth/userinfo",
        params={"with_proposals": "false"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "email": TEST_USER["email"],
        "family_name": TEST_USER["family_name"],
        "given_name": TEST_USER["given_name"],
        "groups": TEST_USER["groups"],
        "name": TEST_USER["name"],
        "preferred_username": TEST_USER["preferred_username"],
        # Fork: the user model always carries this key, empty without proposals.
        "proposals_by_year_half": {},
    }


async def test_graphql_get_user_wire_shape_unchanged(logged_in_client):
    response = await logged_in_client.post(
        "/graphql",
        json={
            "query": (
                "query { get_user"
                " { email family_name given_name groups name preferred_username } }"
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("errors") is None
    assert payload["data"]["get_user"] == {
        "email": TEST_USER["email"],
        "family_name": TEST_USER["family_name"],
        "given_name": TEST_USER["given_name"],
        "groups": TEST_USER["groups"],
        "name": TEST_USER["name"],
        "preferred_username": TEST_USER["preferred_username"],
    }
