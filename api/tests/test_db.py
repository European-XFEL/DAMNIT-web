"""Tests for the NullPool/AUTOCOMMIT engine configuration.

The default pool keeps aiosqlite connections (and their underlying
file descriptors to runs.sqlite) alive between operations. NullPool
disposes the connection per checkout so no descriptor lingers when
the engine is idle; AUTOCOMMIT keeps statements out of session-level
transactions.
"""

import asyncio
import os
import sqlite3
from pathlib import Path

import pytest
from sqlalchemy.pool import NullPool

from damnit_api.runs.sqlite import (
    DAMNIT_PATH,
    DatabaseSessionManager,
    async_table,
    get_session,
)
from damnit_api.shared.models import ProposalNumber

_TEST_PROPOSAL = ProposalNumber(999999)

# -----------------------------------------------------------------------------
# Fixtures

RUNS_SCHEMA = """
CREATE TABLE runs (
    proposal INTEGER,
    runnr INTEGER,
    start_time REAL
)
"""


@pytest.fixture
def damnit_db(mocker, tmp_path):
    root = tmp_path / DAMNIT_PATH
    root.mkdir(parents=True)
    db_file = root / "runs.sqlite"
    conn = sqlite3.connect(str(db_file))
    try:
        conn.executescript(RUNS_SCHEMA)
        conn.commit()
    finally:
        conn.close()
    # Path resolution is exercised in its own tests; here the manager just
    # needs to point at the tmp DAMNIT directory holding runs.sqlite.
    mocker.patch(
        "damnit_api.runs.sqlite.session.get_damnit_path",
        return_value=str(root),
    )
    return _TEST_PROPOSAL


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
def test_no_lingering_file_descriptor_after_read(damnit_db, damnit_registry, tmp_path):
    db_file = tmp_path / DAMNIT_PATH / "runs.sqlite"

    async def do_read():
        table = await async_table(damnit_registry, damnit_db, name="runs")
        async with get_session(damnit_registry, damnit_db) as session:
            await session.execute(table.select())

    assert _open_file_descriptors_to(db_file) == []
    asyncio.run(do_read())
    assert _open_file_descriptors_to(db_file) == []
