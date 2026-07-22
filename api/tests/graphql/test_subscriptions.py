import asyncio
from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from damnit_api.graphql.subscriptions import (
    POLLING_INTERVAL,
    filter_for_client,
    poll_proposal,
)
from damnit_api.runs.types import DamnitRun, TableMeta
from damnit_api.shared.const import DamnitType

from .const import (
    KNOWN_DATA,
    NEW_DATA,
    PROPOSAL,
    RUN_IDENTIFIERS,
    DatabaseVariable,
    get_values,
)
from .utils import create_run_variables

NEW_RUN = 400

patched_sleep = patch.object(asyncio, "sleep", return_value=None)

SUBSCRIPTION = """
    subscription RunUpdatesSubscription(
      $proposal: String,
      $since: Timestamp!) {
      run_updates(database: { proposal: $proposal }, since: $since) {
        runs {
          database
          proposal
          run
          cells { name value dtype }
        }
        metadata {
          runs { proposal run }
        }
        timestamp
      }
    }
"""


@pytest.fixture(scope="module")
def current_timestamp():
    return datetime.now(tz=UTC).timestamp()


@pytest.fixture
def mocked_latest_rows(mocker, current_timestamp):
    table_sentinel = mocker.sentinel.run_variables_table
    mocker.patch(
        "damnit_api.graphql.subscriptions.async_table",
        return_value=table_sentinel,
    )
    mocker.patch(
        "damnit_api.graphql.subscriptions.async_max",
        return_value=0,
    )

    def mocked_returns(*args, table, **kwargs):
        if table is table_sentinel:
            return create_run_variables(
                get_values(NEW_DATA),
                proposal=PROPOSAL,
                run=NEW_RUN,
                timestamp=current_timestamp,
            )
        return None

    return mocker.patch(
        "damnit_api.graphql.subscriptions.async_latest_rows",
        side_effect=mocked_returns,
    )


@pytest.fixture
def mocked_no_new_rows(mocker):
    """The poll finds the `run_variables` table but nothing newer in it."""
    mocker.patch(
        "damnit_api.graphql.subscriptions.async_table",
        return_value=mocker.sentinel.run_variables_table,
    )
    mocker.patch("damnit_api.graphql.subscriptions.async_max", return_value=0)
    return mocker.patch(
        "damnit_api.graphql.subscriptions.async_latest_rows",
        return_value=[],
    )


@pytest.fixture
def mocked_fetch_info(mocker):
    # fetch_info returns a mapping keyed by (proposal, run).
    info = {**get_values(KNOWN_DATA), "run": NEW_RUN}
    return mocker.patch(
        "damnit_api.graphql.subscriptions.fetch_info",
        return_value={(info["proposal"], info["run"]): info},
    )


@pytest.fixture
def mocked_metadata_reads(
    mocked_metadata_variables,
    mocked_metadata_run_identifiers,
    mocked_metadata_all_tags,
    mocked_metadata_variable_tags,
    mocked_metadata_max,
):
    """The sqlite reads behind `fetch_metadata`, for polling the poll directly
    instead of through the schema."""


@pytest.mark.asyncio
async def test_run_updates(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
):
    subscription = await graphql_schema.subscribe(
        SUBSCRIPTION,
        variable_values={
            "proposal": str(PROPOSAL),
            "since": (current_timestamp - 1) * 1000,  # before the new row
        },
    )

    try:
        result = await asyncio.wait_for(anext(subscription), timeout=2)
        assert not result.errors

        payload = result.data["run_updates"]
        assert payload["timestamp"] == current_timestamp * 1000

        # One changed run, carrying its identity trio and merged variables.
        assert len(payload["runs"]) == 1
        run = payload["runs"][0]
        assert run["database"] == str(PROPOSAL)
        assert run["proposal"] == str(PROPOSAL)
        assert run["run"] == NEW_RUN

        expected = {
            **KNOWN_DATA,
            **NEW_DATA,
            "run": DatabaseVariable(value=NEW_RUN, damnit_dtype=DamnitType.NUMBER),
        }
        got = {
            v["name"]: {"value": v["value"], "dtype": v["dtype"]} for v in run["cells"]
        }
        assert got == {
            name: {"value": var.damnit_value, "dtype": var.damnit_dtype.value}
            for name, var in expected.items()
        }

        # Nothing has been pushed before, so this push carries the full,
        # server-ordered metadata as (proposal, run) pairs.
        metadata = payload["metadata"]
        assert metadata["runs"] == [
            {"proposal": str(proposal), "run": run_number}
            for proposal, run_number in RUN_IDENTIFIERS
        ]
    finally:
        await subscription.aclose()


@pytest.mark.asyncio
async def test_run_updates_with_concurrent_subscriptions(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
):
    variables = {
        "proposal": str(PROPOSAL),
        "since": (current_timestamp - 1) * 1000,  # before the new row
    }

    first_sub = await graphql_schema.subscribe(SUBSCRIPTION, variable_values=variables)
    second_sub = await graphql_schema.subscribe(SUBSCRIPTION, variable_values=variables)

    try:
        with patched_sleep:
            result = await asyncio.wait_for(anext(first_sub), timeout=2)
            assert not result.errors
            mocked_latest_rows.assert_called()

        mocked_latest_rows.reset_mock()

        with patched_sleep:
            result = await asyncio.wait_for(anext(second_sub), timeout=2)
            assert not result.errors
            mocked_latest_rows.assert_not_called()
    finally:
        await first_sub.aclose()
        await second_sub.aclose()


@pytest.mark.asyncio
async def test_run_updates_with_nonconcurrent_subscriptions(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
):
    variables = {
        "proposal": str(PROPOSAL),
        "since": (current_timestamp - 1) * 1000,  # before the new row
    }

    first_sub = await graphql_schema.subscribe(SUBSCRIPTION, variable_values=variables)
    second_sub = await graphql_schema.subscribe(SUBSCRIPTION, variable_values=variables)

    try:
        with patched_sleep:
            result = await asyncio.wait_for(anext(first_sub), timeout=2)
            assert not result.errors
            mocked_latest_rows.assert_called()

        await asyncio.sleep(POLLING_INTERVAL * 3)  # give enough time to clear the cache
        mocked_latest_rows.reset_mock()

        with patched_sleep:
            result = await asyncio.wait_for(anext(second_sub), timeout=2)
            assert not result.errors
            mocked_latest_rows.assert_called()
    finally:
        await first_sub.aclose()
        await second_sub.aclose()


@pytest.mark.asyncio
async def test_metadata_reaches_a_subscriber_that_polls_in_a_later_window(
    graphql_schema,
    current_timestamp,
    mocked_latest_rows,
    mocked_fetch_info,
):
    variables = {
        "proposal": str(PROPOSAL),
        "since": (current_timestamp - 1) * 1000,  # before the new row
    }

    first_sub = await graphql_schema.subscribe(SUBSCRIPTION, variable_values=variables)
    second_sub = await graphql_schema.subscribe(SUBSCRIPTION, variable_values=variables)

    try:
        with patched_sleep:
            first = await asyncio.wait_for(anext(first_sub), timeout=2)

        # Subscribers drift apart: each generator's period is a sleep plus its
        # own poll, so the second lands in a later cache window and re-runs the
        # poll body. The metadata it has never been sent still has to arrive.
        await asyncio.sleep(POLLING_INTERVAL * 3)

        with patched_sleep:
            second = await asyncio.wait_for(anext(second_sub), timeout=2)

        assert first.data["run_updates"]["metadata"] is not None
        assert second.data["run_updates"]["metadata"] is not None
    finally:
        await first_sub.aclose()
        await second_sub.aclose()


# -----------------------------------------------------------------------------
# poll_proposal


@pytest.mark.asyncio
async def test_poll_reports_a_signature_when_no_rows_changed(
    mocked_no_new_rows, mocked_metadata_reads
):
    snapshot = await poll_proposal(proposal=str(PROPOSAL))

    assert snapshot["runs"] == {}
    assert snapshot["metadata_signature"]


@pytest.mark.asyncio
async def test_poll_repeats_the_signature_while_metadata_is_unchanged(
    mocked_no_new_rows, mocked_metadata_reads
):
    first = await poll_proposal(proposal=str(PROPOSAL))

    poll_proposal.cache_clear()
    second = await poll_proposal(proposal=str(PROPOSAL))

    assert second["metadata_signature"] == first["metadata_signature"]


@pytest.mark.asyncio
async def test_poll_stops_rereading_metadata_once_a_proposal_is_idle(
    mocked_no_new_rows, mocked_metadata_reads, mocked_metadata_run_identifiers
):
    await poll_proposal(proposal=str(PROPOSAL))
    reads = mocked_metadata_run_identifiers.call_count

    poll_proposal.cache_clear()
    await poll_proposal(proposal=str(PROPOSAL))

    # No new rows and no new run, so the tick rides the metadata cache instead
    # of scanning every (proposal, run) pair in run_info again.
    assert mocked_metadata_run_identifiers.call_count == reads


# -----------------------------------------------------------------------------
# filter_for_client


def _snapshot(run_timestamps):
    runs = {
        (proposal, run): DamnitRun(
            database=str(proposal), proposal=str(proposal), run=run, _cells=[]
        )
        for proposal, run in run_timestamps
    }
    return {
        "runs": runs,
        "run_timestamps": run_timestamps,
        "max_timestamp": max(run_timestamps.values()),
        "metadata_signature": "unchanged",
    }


def test_filter_for_client_none_snapshot():
    assert filter_for_client(None, since=0) is None


def test_filter_for_client_cursorless_client_receives_this_tick():
    snapshot = _snapshot({(PROPOSAL, 1): 100.0, (PROPOSAL, 2): 200.0})
    result = filter_for_client(snapshot, since=0)
    assert {run.run for run in result.runs} == {1, 2}


def test_filter_for_client_delivers_metadata_without_changed_runs():
    snapshot = _snapshot({(PROPOSAL, 1): 100.0})
    metadata = TableMeta(
        runs=[], variables={}, tags={}, timestamp=snapshot["max_timestamp"]
    )

    result = filter_for_client(snapshot, since=300.0, metadata=metadata)
    assert result.runs == []
    assert result.metadata is metadata


def test_filter_for_client_excludes_equal_timestamp():
    snapshot = _snapshot({(PROPOSAL, 1): 100.0, (PROPOSAL, 2): 200.0})
    result = filter_for_client(snapshot, since=100.0)
    assert {run.run for run in result.runs} == {2}


def test_filter_for_client_since_above_all_returns_none():
    snapshot = _snapshot({(PROPOSAL, 1): 100.0, (PROPOSAL, 2): 200.0})
    assert filter_for_client(snapshot, since=300.0) is None


# -----------------------------------------------------------------------------
# Authorization


@pytest.mark.asyncio
async def test_run_updates_unauthorized(graphql_schema_no_auth, current_timestamp):
    gen = await graphql_schema_no_auth.subscribe(
        """
        subscription {
          run_updates(database: { proposal: "999999" }, since: 0) { timestamp }
        }
        """,
    )
    # Subscription permission failures surface as a PreExecutionError on the
    # first iteration rather than immediately from subscribe().
    first = await gen.__anext__()
    assert first.errors is not None
    assert first.errors[0].message == "Authentication required."


@pytest.mark.asyncio
async def test_run_updates_forbidden(graphql_schema_authenticated_non_member):
    gen = await graphql_schema_authenticated_non_member.subscribe(
        f"""
        subscription {{
          run_updates(database: {{ proposal: "{PROPOSAL}" }}, since: 0) {{
            timestamp
          }}
        }}
        """,
    )
    # Subscription permission failures surface as a PreExecutionError on the
    # first iteration rather than immediately from subscribe().
    first = await gen.__anext__()
    assert first.errors is not None
    assert first.errors[0].message == "Access to this proposal is forbidden."
