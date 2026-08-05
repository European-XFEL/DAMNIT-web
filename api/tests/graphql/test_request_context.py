"""A preview aliases one root field per run, so a single request resolves up
to 50 of them concurrently against one shared `AsyncSession`. These tests pin
that the request-scoped work each resolver needs runs exactly once.
"""

import asyncio

import pytest

from damnit_api.graphql.queries import _ensure_damnit_path
from damnit_api.shared.gql import Context
from damnit_api.shared.settings import settings

CONCURRENT_FIELDS = 50


class CountingWork:
    """Stand-in for work that awaits. It yields control before returning, so a
    caller that does not serialize lets every other caller in first."""

    def __init__(self, result=None):
        self.calls = 0
        self.result = result

    async def __call__(self, *args, **kwargs):
        self.calls += 1
        await asyncio.sleep(0)
        return self.result


@pytest.fixture
def context(mocker):
    return Context(mymdc=mocker.Mock(), oauth_user=mocker.Mock(), session=mocker.Mock())


@pytest.fixture
def remote_mode(mocker):
    """`is_local` derives from `damnit_path`, and both memoized paths
    short-circuit in local mode."""
    mocker.patch.object(settings, "damnit_path", None)


@pytest.fixture
def info(mocker, context):
    return mocker.Mock(context=context)


@pytest.fixture
def lookup(mocker):
    """The proposal-meta lookup `_ensure_damnit_path` memoizes."""
    work = CountingWork(result=mocker.Mock(damnit_path="/gpfs/exfel/exp/p1234"))
    mocker.patch("damnit_api.graphql.queries._get_proposal_meta", new=work)
    return work


@pytest.mark.asyncio
async def test_get_user_runs_the_auth_path_once_for_concurrent_resolvers(
    mocker, context
):
    resolve_user = CountingWork(result="the-user")
    mocker.patch("damnit_api.auth.models.User.from_oauth_user", new=resolve_user)

    users = await asyncio.gather(*[
        context.get_user() for _ in range(CONCURRENT_FIELDS)
    ])

    assert resolve_user.calls == 1
    assert users == ["the-user"] * CONCURRENT_FIELDS


@pytest.mark.asyncio
async def test_ensure_damnit_path_looks_a_proposal_up_once_per_request(
    info, lookup, remote_mode
):
    await asyncio.gather(*[
        _ensure_damnit_path(info, "1234") for _ in range(CONCURRENT_FIELDS)
    ])

    assert lookup.calls == 1


@pytest.mark.asyncio
async def test_ensure_damnit_path_looks_up_each_distinct_proposal(
    info, lookup, remote_mode
):
    await _ensure_damnit_path(info, "1234")
    await _ensure_damnit_path(info, "5678")

    assert lookup.calls == 2


@pytest.mark.asyncio
async def test_ensure_damnit_path_retries_after_a_failed_lookup(
    mocker, info, lookup, remote_mode
):
    lookup.result = mocker.Mock(damnit_path=None)
    mocker.patch(
        "damnit_api.graphql.queries._update_proposal_meta",
        new=CountingWork(result=mocker.Mock(damnit_path=None)),
    )

    # A proposal that never resolves a path must not be remembered as checked.
    for _ in range(2):
        with pytest.raises(ValueError, match="No damnit path found"):
            await _ensure_damnit_path(info, "1234")

    assert lookup.calls == 2
