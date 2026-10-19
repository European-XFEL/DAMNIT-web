"""Tests for the NullPool/AUTOCOMMIT engine and the per-database read lock.

The default pool keeps aiosqlite connections (and their underlying
file descriptors to runs.sqlite) alive between operations. NullPool
disposes the connection per checkout so no descriptor lingers when
the engine is idle; AUTOCOMMIT keeps statements out of session-level
transactions.
"""

import asyncio
import os
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.pool import NullPool

from damnit_api import utils
from damnit_api.runs.sqlite import (
    DAMNIT_PATH,
    DatabaseSessionManager,
    async_table,
    get_connection,
    get_session,
)

# -----------------------------------------------------------------------------
# Fixtures

RUNS_SCHEMA = """
CREATE TABLE runs (
    proposal INTEGER,
    runnr INTEGER,
    start_time REAL
)
"""


def _make_damnit_db(proposal_root: Path):
    damnit_dir = proposal_root / DAMNIT_PATH
    damnit_dir.mkdir(parents=True)
    conn = sqlite3.connect(str(damnit_dir / "runs.sqlite"))
    try:
        conn.executescript(RUNS_SCHEMA)
        conn.commit()
    finally:
        conn.close()

    return str(proposal_root)


@pytest.fixture
def damnit_db(tmp_path):
    return _make_damnit_db(tmp_path)


def _open_file_descriptors_to(db_file: Path):
    fd_dir = Path(f"/proc/{os.getpid()}/fd")
    hits = []
    for link in fd_dir.iterdir():
        try:
            target = link.readlink()
        except OSError:
            continue
        if target == db_file:
            hits.append(str(target))
    return hits


# -----------------------------------------------------------------------------
# Engine configuration


def test_engine_uses_nullpool_and_autocommit(damnit_db):
    mgr = DatabaseSessionManager(damnit_db)
    assert isinstance(mgr._engine.pool, NullPool)
    # Private attribute: the public get_execution_options() does not
    # surface the engine-level isolation_level for async engines.
    assert mgr._engine.dialect._on_connect_isolation_level == "AUTOCOMMIT"


# -----------------------------------------------------------------------------
# File descriptor lifetime


# asyncio.run() creates and tears down a fresh event loop, which is what
# this test verifies (no file descriptors leak after the loop dies).
# alru_cached async_table sees that loop change; warning is intrinsic.
@pytest.mark.filterwarnings("ignore::async_lru.AlruCacheLoopResetWarning")
def test_no_lingering_file_descriptor_after_read(damnit_db):
    db_file = Path(damnit_db) / DAMNIT_PATH / "runs.sqlite"

    async def do_read():
        table = await async_table(damnit_db, name="runs")
        async with get_session(damnit_db) as session:
            await session.execute(table.select())

    assert _open_file_descriptors_to(db_file) == []
    asyncio.run(do_read())
    assert _open_file_descriptors_to(db_file) == []


# -----------------------------------------------------------------------------
# Table lookup


# The asyncio.run in the test above leaves pytest-asyncio no current loop, so
# this test runs its own, shared by both lookups: a new loop clears the miss.
@pytest.mark.filterwarnings("ignore::async_lru.AlruCacheLoopResetWarning")
def test_a_table_created_after_a_lookup_missed_it_is_found(damnit_db):
    db_file = Path(damnit_db) / DAMNIT_PATH / "runs.sqlite"

    with asyncio.Runner() as runner:
        missed = runner.run(async_table(damnit_db, name="run_variables"))

        with closing(sqlite3.connect(db_file)) as conn, conn:
            conn.execute("CREATE TABLE run_variables (name TEXT)")

        found = runner.run(async_table(damnit_db, name="run_variables"))

    assert missed is None
    assert found is not None


# -----------------------------------------------------------------------------
# Reads are serialized per database


async def _read_and_hold(context, steps):
    """Query the runs table inside `context` and keep it open a moment."""
    async with context as db:
        steps.append("enter")
        await db.execute(text("SELECT count(*) FROM runs"))
        await asyncio.sleep(0.05)
        steps.append("leave")


async def _read_at_once(first_context, second_context):
    """Read inside both contexts at once, and return the steps in order."""
    steps = []
    await asyncio.gather(
        _read_and_hold(first_context, steps), _read_and_hold(second_context, steps)
    )

    return steps


def test_reads_on_one_database_run_one_after_the_other(damnit_db):
    steps = asyncio.run(_read_at_once(get_session(damnit_db), get_session(damnit_db)))

    assert steps == ["enter", "leave", "enter", "leave"]


def test_reads_on_two_databases_overlap(tmp_path):
    first_db = _make_damnit_db(tmp_path / "a")
    second_db = _make_damnit_db(tmp_path / "b")

    steps = asyncio.run(_read_at_once(get_session(first_db), get_session(second_db)))

    assert steps == ["enter", "enter", "leave", "leave"]


def test_reads_through_1234_and_001234_run_one_after_the_other(tmp_path, monkeypatch):
    _make_damnit_db(tmp_path / "MID" / "202401" / "p001234")
    monkeypatch.setattr(utils, "DATA_ROOT_DIR", str(tmp_path))

    steps = asyncio.run(_read_at_once(get_session("1234"), get_session("001234")))

    assert steps == ["enter", "leave", "enter", "leave"]


def test_connection_and_session_on_one_database_run_one_after_the_other(
    damnit_db,
):
    steps = asyncio.run(
        _read_at_once(get_connection(damnit_db), get_session(damnit_db))
    )

    assert steps == ["enter", "leave", "enter", "leave"]
