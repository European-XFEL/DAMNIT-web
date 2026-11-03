import asyncio
import sqlite3
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.exc import OperationalError
from structlog.testing import capture_logs

from damnit_api.graphql.subscriptions import (
    POLLING_INTERVAL,
    filter_for_client,
    poll_proposal,
)
from damnit_api.runs.types import DamnitRun, TableMeta
from damnit_api.shared.const import DamnitType

from .const import (
    EXAMPLE_VARIABLE_TAGS,
    KNOWN_DATA,
    NEW_DATA,
    PROPOSAL,
    RUN_IDENTIFIERS,
    DatabaseVariable,
    get_values,
)
from .utils import create_run_variables

NEW_RUN = 400

_real_sleep = asyncio.sleep


# A tick yields to the loop, so a timeout ends a subscription that stops yielding
# results.
async def _sleep_keeping_poll_cache(_delay):
    await _real_sleep(0)


# Ticks of different subscribers share one cache window until a test clears it.
patched_sleep = patch.object(asyncio, "sleep", side_effect=_sleep_keeping_poll_cache)


def ticks_finding_mtimes(mocked_database_mtime, mtimes):
    """Each tick finds the database file at the next of `mtimes`. The first lands in
    the cache window of any poll before it, and each later one reaches the database,
    as ticks a second apart do. Past the last, a tick never ends, so an update that
    never came fails the test's timeout."""
    mtimes = iter(mtimes)
    first_tick = True

    async def sleep(_delay):
        nonlocal first_tick
        try:
            mocked_database_mtime.return_value = next(mtimes)
        except StopIteration:
            await asyncio.Event().wait()

        if not first_tick:
            poll_proposal.cache_clear()
        first_tick = False
        await _real_sleep(0)

    return patch.object(asyncio, "sleep", side_effect=sleep)


SUBSCRIPTION = """
    subscription RunUpdatesSubscription(
      $proposal: String,
      $since: Timestamp!) {
      run_updates(database: { proposal: $proposal }, since: $since) {
        runs {
          database
          proposal
          run
          cells { name summary { value dtype } }
        }
        metadata {
          runs { proposal run }
          tags
        }
        timestamp
      }
    }
"""


@pytest.fixture(scope="module")
def current_timestamp():
    return datetime.now(tz=UTC).timestamp()


@pytest_asyncio.fixture
async def subscription(graphql_schema, current_timestamp):
    """A table opened before the new row, subscribed to its live updates."""
    generator = await graphql_schema.subscribe(
        SUBSCRIPTION,
        variable_values={
            "proposal": str(PROPOSAL),
            "since": (current_timestamp - 1) * 1000,
        },
    )
    yield generator
    await generator.aclose()


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
def mocked_rows_stored_apart(mocked_no_new_rows):
    """The poll finds two values of the new run, stored a minute apart."""
    mocked_no_new_rows.return_value = [
        *create_run_variables(
            {"n_trains": 1200}, proposal=PROPOSAL, run=NEW_RUN, timestamp=1000
        ),
        *create_run_variables(
            {"xgm_intensity": 1.5}, proposal=PROPOSAL, run=NEW_RUN, timestamp=1060
        ),
    ]
    return mocked_no_new_rows


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
    subscription, current_timestamp, mocked_latest_rows, mocked_fetch_info
):
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
        v["name"]: {
            "value": v["summary"]["value"],
            "dtype": v["summary"]["dtype"],
        }
        for v in run["cells"]
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


@pytest.mark.asyncio
async def test_run_updates_send_when_each_value_was_computed(
    graphql_schema, mocked_rows_stored_apart, mocked_fetch_info
):
    subscription = await graphql_schema.subscribe(
        f"""
        subscription {{
          run_updates(database: {{ proposal: "{PROPOSAL}" }}, since: 0) {{
            runs {{ cells {{ name computed_at }} }}
          }}
        }}
        """,
    )

    try:
        with patched_sleep:
            result = await asyncio.wait_for(anext(subscription), timeout=2)
        assert not result.errors

        cells = result.data["run_updates"]["runs"][0]["cells"]
        assert {c["name"]: c["computed_at"] for c in cells} == {
            "n_trains": 1_000_000,
            "xgm_intensity": 1_060_000,
            # From run_info, which DAMNIT does not stamp.
            "proposal": None,
            "run": None,
            "start_time": None,
            "added_at": None,
        }
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


def _operational_error(message):
    """What SQLAlchemy raises when SQLite fails a read."""
    return OperationalError("SELECT", None, sqlite3.OperationalError(message))


@pytest.mark.asyncio
async def test_an_unchanged_database_file_is_not_read(
    subscription,
    mocked_database_mtime,
    mocked_latest_rows,
    mocked_fetch_info,
    mocked_metadata_run_identifiers,
):
    with ticks_finding_mtimes(mocked_database_mtime, [1, 1, 2]) as sleep:
        await asyncio.wait_for(anext(subscription), timeout=2)
        await asyncio.wait_for(anext(subscription), timeout=2)

    # Three ticks, and the second, finding the file as the first left it, read
    # neither rows nor metadata.
    assert sleep.call_count == 3
    assert mocked_latest_rows.call_count == 2
    assert mocked_metadata_run_identifiers.call_count == 2


@pytest.mark.asyncio
async def test_a_tag_edit_reaches_the_subscriber_on_the_next_tick(
    mocker, subscription, mocked_database_mtime, mocked_no_new_rows
):
    with ticks_finding_mtimes(mocked_database_mtime, [1, 2]):
        await asyncio.wait_for(anext(subscription), timeout=2)

        # Someone tags the XGM intensity, which writes no value
        mocker.patch(
            "damnit_api.graphql.metadata.db.async_variable_tags",
            return_value={**EXAMPLE_VARIABLE_TAGS, "xgm_intensity": [9]},
        )
        result = await asyncio.wait_for(anext(subscription), timeout=2)

    tags = result.data["run_updates"]["metadata"]["tags"]
    assert tags["XGM"]["variables"] == ["xgm_intensity"]


@pytest.mark.asyncio
async def test_every_tick_polls_while_the_database_mtime_is_unknown(
    subscription, mocked_database_mtime, mocked_latest_rows, mocked_fetch_info
):
    with ticks_finding_mtimes(mocked_database_mtime, [None, None]):
        await asyncio.wait_for(anext(subscription), timeout=2)
        await asyncio.wait_for(anext(subscription), timeout=2)

    assert mocked_latest_rows.call_count == 2


@pytest.mark.asyncio
async def test_a_failed_tick_does_not_end_live_updates(
    subscription, mocked_database_mtime, mocked_latest_rows, mocked_fetch_info
):
    # One write: the tick that reads it fails, and the next one finds the file
    # unchanged since, yet still has to deliver the run.
    mocked_fetch_info.side_effect = [
        _operational_error("database is locked"),
        mocked_fetch_info.return_value,
    ]

    with ticks_finding_mtimes(mocked_database_mtime, [1, 1]):
        result = await asyncio.wait_for(anext(subscription), timeout=2)

    assert not result.errors
    assert [run["run"] for run in result.data["run_updates"]["runs"]] == [NEW_RUN]


@pytest.mark.asyncio
async def test_each_run_of_failed_ticks_logs_one_warning_with_its_error(
    subscription, mocked_database_mtime, mocked_latest_rows, mocked_fetch_info
):
    good = mocked_fetch_info.return_value
    locked = _operational_error("database is locked")
    io_error = _operational_error("disk I/O error")
    mocked_fetch_info.side_effect = [locked, locked, good, io_error, good]

    with (
        ticks_finding_mtimes(mocked_database_mtime, [1, 1, 1, 2, 2]),
        capture_logs() as logs,
    ):
        # Two failed ticks, then a good one
        await asyncio.wait_for(anext(subscription), timeout=2)

        # A new write whose first poll fails
        await asyncio.wait_for(anext(subscription), timeout=2)

    warnings = [log["error"] for log in logs if log["log_level"] == "warning"]
    assert warnings == [repr(locked), repr(io_error)]


@pytest.mark.asyncio
async def test_a_tick_finding_the_file_unchanged_ends_a_run_of_failures(
    subscription, mocked_database_mtime, mocked_latest_rows, mocked_fetch_info
):
    good = mocked_fetch_info.return_value
    locked = _operational_error("database is locked")
    io_error = _operational_error("disk I/O error")
    mocked_fetch_info.side_effect = [good, locked, io_error, good]

    with (
        ticks_finding_mtimes(mocked_database_mtime, [1, None, 1, 2, 2]),
        capture_logs() as logs,
    ):
        # A good poll
        await asyncio.wait_for(anext(subscription), timeout=2)

        # A failed poll while the file cannot be stat'ed, a tick finding the file as
        # the good poll left it, then a new write whose first poll fails
        await asyncio.wait_for(anext(subscription), timeout=2)

    warnings = [log["error"] for log in logs if log["log_level"] == "warning"]
    assert warnings == [repr(locked), repr(io_error)]


@pytest.mark.asyncio
async def test_a_write_reaches_a_subscriber_first_served_a_snapshot_from_before_it(
    graphql_schema,
    current_timestamp,
    mocked_database_mtime,
    mocked_no_new_rows,
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
            await asyncio.wait_for(anext(first_sub), timeout=2)

            # DAMNIT writes the new run, and the second subscriber's tick still
            # finds the first one's snapshot in the cache
            mocked_database_mtime.return_value = 2
            mocked_no_new_rows.return_value = create_run_variables(
                get_values(NEW_DATA),
                proposal=PROPOSAL,
                run=NEW_RUN,
                timestamp=current_timestamp,
            )
            await asyncio.wait_for(anext(second_sub), timeout=2)

            # The cache window ends, and the first subscriber reads the write
            poll_proposal.cache_clear()
            await asyncio.wait_for(anext(first_sub), timeout=2)

            result = await asyncio.wait_for(anext(second_sub), timeout=2)
    finally:
        await first_sub.aclose()
        await second_sub.aclose()

    assert [run["run"] for run in result.data["run_updates"]["runs"]] == [NEW_RUN]


@pytest.mark.asyncio
async def test_a_table_created_while_a_poll_without_it_is_cached_reaches_a_subscriber(
    mocker, subscription, mocked_database_mtime, mocked_no_new_rows
):
    async_table = mocker.patch(
        "damnit_api.graphql.subscriptions.async_table", return_value=None
    )

    # Another subscriber's tick finds DAMNIT still creating the database
    await poll_proposal(proposal=str(PROPOSAL))

    # DAMNIT creates `run_variables` within that cache window
    async_table.return_value = mocker.sentinel.run_variables_table

    with ticks_finding_mtimes(mocked_database_mtime, [2, 2]):
        result = await asyncio.wait_for(anext(subscription), timeout=2)

    assert result.data["run_updates"]["metadata"]


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


def test_filter_for_client_cursorless_client_receives_this_tick():
    snapshot = _snapshot({(PROPOSAL, 1): 100.0, (PROPOSAL, 2): 200.0})
    result = filter_for_client(snapshot, since=0)
    assert {run.run for run in result.runs} == {1, 2}


def test_filter_for_client_delivers_metadata_without_changed_runs():
    snapshot = _snapshot({(PROPOSAL, 1): 100.0})
    metadata = TableMeta(
        runs=[], variables={}, tags={}, groups={}, timestamp=snapshot["max_timestamp"]
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
