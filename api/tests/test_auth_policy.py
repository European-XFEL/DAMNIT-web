"""Tests for the proposal-membership policy and its REST edge guard."""

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import TYPE_CHECKING, cast

import pytest
from litestar.connection import ASGIConnection

from damnit_api.auth.models import User
from damnit_api.auth.policy import proposal_member_guard, require_proposal_member
from damnit_api.shared.errors import ForbiddenError, UnauthenticatedError
from damnit_api.shared.models import ProposalNumber

if TYPE_CHECKING:
    from litestar.handlers.base import BaseRouteHandler

# Sync test-client files earlier in the collection order close the
# session-scoped loop; run on per-test loops instead.
pytestmark = pytest.mark.asyncio(loop_scope="function")

# The guard's second argument is unused; a typed placeholder keeps the calls
# type-correct without constructing a real route handler.
_HANDLER = cast("BaseRouteHandler", None)


def _user(*proposals: int) -> User:
    fake = SimpleNamespace(proposals=[ProposalNumber(p) for p in proposals])
    return cast("User", fake)


# -----------------------------------------------------------------------------
# require_proposal_member


async def test_member_is_allowed():
    await require_proposal_member(_user(1234), ProposalNumber(1234))


async def test_non_member_is_forbidden():
    with pytest.raises(ForbiddenError):
        await require_proposal_member(_user(1111), ProposalNumber(1234))


async def test_local_mode_bypasses_membership(mocker):
    from damnit_api.shared import settings as settings_module

    mocker.patch.object(settings_module.settings, "damnit_path", "/data/p1234")
    assert settings_module.settings.is_local
    await require_proposal_member(_user(), ProposalNumber(1234))


# -----------------------------------------------------------------------------
# proposal_member_guard


def _connection(
    *,
    path_params: dict | None = None,
    query_params: dict | None = None,
) -> ASGIConnection:
    @asynccontextmanager
    async def sessionmaker():  # noqa: RUF029
        yield object()

    app_state = SimpleNamespace(mymdc_client=object(), db_sessionmaker=sessionmaker)
    fake = SimpleNamespace(
        path_params=path_params or {},
        query_params=query_params or {},
        app=SimpleNamespace(state=SimpleNamespace(app_state=app_state)),
    )
    return cast("ASGIConnection", fake)


async def test_guard_forbids_route_without_proposal_number():
    with pytest.raises(ForbiddenError):
        await proposal_member_guard(_connection(), _HANDLER)


async def test_guard_rejects_unauthenticated_connection(mocker):
    mocker.patch(
        "damnit_api.auth.models.User.from_connection",
        new_callable=mocker.AsyncMock,
        side_effect=UnauthenticatedError("No user info in session"),
    )
    conn = _connection(path_params={"proposal_number": 1234})
    with pytest.raises(UnauthenticatedError):
        await proposal_member_guard(conn, _HANDLER)


async def test_guard_allows_member_via_path_param(mocker):
    mocker.patch(
        "damnit_api.auth.models.User.from_connection",
        new_callable=mocker.AsyncMock,
        return_value=_user(1234),
    )
    conn = _connection(path_params={"proposal_number": 1234})
    await proposal_member_guard(conn, _HANDLER)


async def test_guard_forbids_non_member_via_query_param(mocker):
    mocker.patch(
        "damnit_api.auth.models.User.from_connection",
        new_callable=mocker.AsyncMock,
        return_value=_user(1111),
    )
    conn = _connection(query_params={"proposal_number": "1234"})
    with pytest.raises(ForbiddenError):
        await proposal_member_guard(conn, _HANDLER)
