"""Check that the auth HTTP behaves the same during the refactor.

Requests are made to the real app over plain HTTP.

!!! warning

    Session establishment is faked with a minted cookie (see conftest).
"""

import pytest

from .conftest import TEST_USER

pytestmark = [pytest.mark.vcr, pytest.mark.asyncio]


async def test_login_redirects_to_oidc_provider_unchanged(e2e_client):
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
