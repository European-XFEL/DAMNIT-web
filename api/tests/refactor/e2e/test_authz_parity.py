"""Check that access-control outcomes stay the same during the refactor.

The minted session user (`e2etester`) is a member of exactly the recorded proposals
{900000, 900001, 900549} (see `tests/mock/mymdc/identity_map.py`), so membership and
non-membership are fixture properties, not live MyMdC state.

!!! warning

    These tests pin today's deny behaviour, which has a known issue to fix: an
    unauthenticated GraphQL request raises an unhandled `ValueError` rather than
    returning a 401 (see `test_graphql_query_without_session_unchanged`). Once
    fixed, update the tests to reflect the new behaviour.
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
    return {"query": f'query {{ metadata(database: {{ proposal: "{proposal}" }}) }}'}


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


async def test_graphql_query_without_session_unchanged(e2e_client):
    """Today an unauthenticated GraphQL request is NOT turned into an HTTP error.

    !!! todo

        Currently session-lookup `ValueError` is unhandled (surfaced here by raw ASGI
        transport). This should become a proper 401 error, test and must be updated
        this test when it does.
    """
    with pytest.raises(ValueError, match="No user info in session"):
        await e2e_client.post("/graphql", json=runs_query(MEMBER_PROPOSAL))
