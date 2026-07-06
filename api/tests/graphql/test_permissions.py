"""Unit tests for the real bodies of the Strawberry permission classes.

The schema-level tests in `test_queries.py`/`test_subscriptions.py` mock
`has_permission`, so these tests exercise the actual logic directly.
"""

from types import SimpleNamespace
from typing import Any

import pytest
from strawberry.exceptions import StrawberryGraphQLError

from damnit_api.auth.permissions import IsAuthenticated, IsProposalMember
from damnit_api.shared.errors import ForbiddenError


def _info(context: Any) -> Any:
    return SimpleNamespace(context=context)


def _context(*, oauth_user: Any = "oauth", user: Any = None) -> Any:
    return SimpleNamespace(
        oauth_user=oauth_user,
        mymdc=object(),
        session=object(),
        user=user,
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
async def test_is_proposal_member_no_database():
    info = _info(_context())
    assert await IsProposalMember().has_permission(None, info) is False


@pytest.mark.asyncio
async def test_is_proposal_member_none_proposal():
    info = _info(_context())
    database = SimpleNamespace(proposal=None)
    result = await IsProposalMember().has_permission(None, info, database=database)
    assert result is False


@pytest.mark.asyncio
async def test_is_proposal_member_malformed_proposal():
    # Parsing fails before any user resolution / network call, so no mocks needed.
    perm = IsProposalMember()
    info = _info(_context())
    database = SimpleNamespace(proposal="not-a-number")

    with pytest.raises(StrawberryGraphQLError, match=r"Invalid proposal identifier\."):
        await perm.has_permission(None, info, database=database)
    assert perm.message == "Access to this proposal is forbidden."


@pytest.mark.asyncio
async def test_is_proposal_member_allowed(mocker):
    check = mocker.patch(
        "damnit_api.auth.permissions._check_user_allowed",
        new_callable=mocker.AsyncMock,
    )
    from_oauth = mocker.patch(
        "damnit_api.auth.permissions.User.from_oauth_user",
        new_callable=mocker.AsyncMock,
        return_value="resolved-user",
    )
    ctx = _context(user=None)
    database = SimpleNamespace(proposal="p1234")

    result = await IsProposalMember().has_permission(
        None, _info(ctx), database=database
    )
    assert result is True
    # User resolved from oauth and cached on the context.
    from_oauth.assert_awaited_once()
    assert ctx.user == "resolved-user"
    check.assert_awaited_once_with(1234, "resolved-user")


@pytest.mark.asyncio
async def test_is_proposal_member_forbidden(mocker):
    mocker.patch(
        "damnit_api.auth.permissions._check_user_allowed",
        new_callable=mocker.AsyncMock,
        side_effect=ForbiddenError("nope"),
    )
    mocker.patch(
        "damnit_api.auth.permissions.User.from_oauth_user",
        new_callable=mocker.AsyncMock,
        return_value="resolved-user",
    )
    database = SimpleNamespace(proposal="1234")

    result = await IsProposalMember().has_permission(
        None, _info(_context()), database=database
    )
    assert result is False


@pytest.mark.asyncio
async def test_is_proposal_member_reuses_cached_user(mocker):
    check = mocker.patch(
        "damnit_api.auth.permissions._check_user_allowed",
        new_callable=mocker.AsyncMock,
    )
    from_oauth = mocker.patch(
        "damnit_api.auth.permissions.User.from_oauth_user",
        new_callable=mocker.AsyncMock,
    )
    ctx = _context(user="cached-user")
    database = SimpleNamespace(proposal="1234")

    result = await IsProposalMember().has_permission(
        None, _info(ctx), database=database
    )
    assert result is True
    # Already-resolved user is reused; no second resolution.
    from_oauth.assert_not_awaited()
    check.assert_awaited_once_with(1234, "cached-user")
