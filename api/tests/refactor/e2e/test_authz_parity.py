"""Check that access-control outcomes stay the same during the refactor.

The minted session user (`e2etester`) is a member of exactly the recorded proposals
{900000, 900001, 900549} (see `tests/mock/mymdc/identity_map.py`), so membership and
non-membership are fixture properties, not live MyMdC state.
"""

import pytest

pytestmark = [pytest.mark.vcr, pytest.mark.asyncio]

# The fixture proposal: e2etester is a member AND its data exists on disk
# (tests/mock/data/gpfs/, wired in by the conftest)
MEMBER_PROPOSAL = 6996
NON_MEMBER_PROPOSAL = 700000

FORBIDDEN_MESSAGE = "Access to this proposal is forbidden."


def runs_query(proposal: int) -> dict:
    return {
        "query": f"""
            query {{
              runs(database: {{proposal: "{proposal}"}}, per_page: 1) {{
                cells {{ name }}
              }}
            }}
        """
    }


def metadata_query(proposal: int) -> dict:
    return {
        "query": f"""
            query {{
              metadata(database: {{ proposal: "{proposal}" }}) {{ timestamp }}
            }}
        """
    }


async def test_runs_query_forbidden_for_non_member_unchanged(logged_in_client):
    response = await logged_in_client.post(
        "/graphql", json=runs_query(NON_MEMBER_PROPOSAL)
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"] is None
    assert [e["message"] for e in payload["errors"]] == [FORBIDDEN_MESSAGE]


async def test_metadata_query_forbidden_for_non_member_unchanged(logged_in_client):
    response = await logged_in_client.post(
        "/graphql", json=metadata_query(NON_MEMBER_PROPOSAL)
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"] is None
    assert [e["message"] for e in payload["errors"]] == [FORBIDDEN_MESSAGE]


async def test_member_passes_authorization_unchanged(logged_in_client):
    """A member is not blocked by the permission layer and the query succeeds.

    The fixture data tree serves the proposal's DAMNIT database, so this proves
    the whole path: session -> membership -> path resolution -> run data.
    Detailed wire-shape assertions live in the data parity tests.
    """
    response = await logged_in_client.post("/graphql", json=runs_query(MEMBER_PROPOSAL))

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("errors") is None
    assert payload["data"]["runs"]


async def test_graphql_query_without_session_answers_401(e2e_client):
    response = await e2e_client.post("/graphql", json=runs_query(MEMBER_PROPOSAL))

    assert response.status_code == 401
    body = response.json()
    assert body["message"] == "No user info in session"
    assert body["status_code"] == 401
