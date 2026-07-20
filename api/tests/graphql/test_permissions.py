"""Unit tests for the real bodies of the Strawberry permission classes.

The schema-level tests in `test_queries.py`/`test_subscriptions.py` mock
`has_permission`, so these tests exercise the actual logic directly.
"""

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from strawberry.exceptions import StrawberryGraphQLError

from damnit_api.auth.permissions import IsAuthenticated, IsProposalMember
from damnit_api.shared.errors import ForbiddenError
from damnit_api.shared.models import ProposalNumber


def _info(context: Any) -> Any:
    return SimpleNamespace(context=context)


def _context(*, oauth_user: Any = "oauth", user: Any = "resolved-user") -> Any:
    return SimpleNamespace(
        oauth_user=oauth_user,
        get_user=AsyncMock(return_value=user),
    )


# -----------------------------------------------------------------------------
# IsAuthenticated


@pytest.mark.asyncio
async def test_is_authenticated_no_context():
    assert await IsAuthenticated().has_permission(None, _info(None)) is False


@pytest.mark.asyncio
async def test_is_authenticated_no_oauth_user():
    info = _info(_context(oauth_user=None))
    assert await IsAuthenticated().has_permission(None, info) is False


@pytest.mark.asyncio
async def test_is_authenticated_with_oauth_user():
    info = _info(_context(oauth_user="oauth"))
    assert await IsAuthenticated().has_permission(None, info) is True


# -----------------------------------------------------------------------------
# IsProposalMember


@pytest.mark.asyncio
async def test_is_proposal_member_missing_database():
    """Database input is required for proposal authorization, if it's missing that
    should be a specific error."""
    info = _info(_context())
    with pytest.raises(StrawberryGraphQLError, match="misconfigured"):
        await IsProposalMember().has_permission(None, info)


@pytest.mark.asyncio
async def test_is_proposal_member_none_proposal():
    info = _info(_context())
    database = SimpleNamespace(proposal=None)
    result = await IsProposalMember().has_permission(None, info, database=database)
    assert result is False


@pytest.mark.asyncio
async def test_is_proposal_member_allowed(mocker):
    check = mocker.patch(
        "damnit_api.auth.permissions._check_user_allowed",
        new_callable=mocker.AsyncMock,
    )
    ctx = _context(user="resolved-user")
    database = SimpleNamespace(proposal=ProposalNumber(1234))

    result = await IsProposalMember().has_permission(
        None, _info(ctx), database=database
    )
    assert result is True
    ctx.get_user.assert_awaited_once()
    check.assert_awaited_once_with(ProposalNumber(1234), "resolved-user")


@pytest.mark.asyncio
async def test_is_proposal_member_safe_upstream_error():
    """Upstream errors should not leak info to the client."""
    ctx = _context()
    ctx.get_user.side_effect = RuntimeError(
        "https://in.xfel.eu/metadata/api/ sensitive error beep boop"
    )
    database = SimpleNamespace(proposal=ProposalNumber(1234))

    with pytest.raises(StrawberryGraphQLError) as excinfo:
        await IsProposalMember().has_permission(None, _info(ctx), database=database)
    assert "sensitive error beep boop" not in str(excinfo.value)


@pytest.mark.asyncio
async def test_is_proposal_member_forbidden(mocker):
    mocker.patch(
        "damnit_api.auth.permissions._check_user_allowed",
        new_callable=mocker.AsyncMock,
        side_effect=ForbiddenError("nope"),
    )
    database = SimpleNamespace(proposal=ProposalNumber(1234))

    result = await IsProposalMember().has_permission(
        None, _info(_context()), database=database
    )
    assert result is False
