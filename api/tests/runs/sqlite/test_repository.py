"""Integration tests for SQLiteDamnitRepository against a real on-disk DB.

The repository resolves its path through `DatabaseSessionManager` ->
`get_damnit_path`; the fixtures mock that to point at a tmp `runs.sqlite`.
"""

import sqlite3

import pytest
import pytest_asyncio

from damnit_api.runs.models import KNOWN_VARIABLES
from damnit_api.runs.sqlite.repository import SQLiteDamnitRepository
from damnit_api.shared.models import ProposalNumber

_TEST_PROPOSAL = ProposalNumber(999998)

_SCHEMA = """
CREATE TABLE run_variables (
    proposal  INTEGER NOT NULL,
    run       INTEGER NOT NULL,
    name      TEXT    NOT NULL,
    value     BLOB,
    summary_type TEXT,
    attributes BLOB,
    timestamp REAL    NOT NULL,
    PRIMARY KEY (proposal, run, name, timestamp)
);
CREATE TABLE run_info (run INTEGER PRIMARY KEY, start_time REAL, added_at REAL);
CREATE TABLE variables (name TEXT PRIMARY KEY, title TEXT);
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE variable_tags (
    variable_name TEXT NOT NULL, tag_id INTEGER NOT NULL,
    PRIMARY KEY (variable_name, tag_id)
);
CREATE TABLE metameta (key TEXT PRIMARY KEY, value TEXT);
"""


def _seed(db_file):
    conn = sqlite3.connect(str(db_file))
    try:
        conn.executescript(_SCHEMA)
        p = int(_TEST_PROPOSAL)
        conn.executemany(
            "INSERT INTO run_variables"
            " (proposal, run, name, value, summary_type, timestamp)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            [
                (p, 1, "alpha", "a1", None, 1000.0),
                (p, 1, "beta", "b1", None, 1000.0),
                (p, 2, "alpha", "a2", None, 1100.0),
                (p, 3, "beta", "b3", None, 1200.0),
                # Older timestamp for run 1 / alpha - must be ignored.
                (p, 1, "alpha", "a1_old", None, 900.0),
            ],
        )
        conn.executemany(
            "INSERT INTO run_info (run, start_time, added_at) VALUES (?, ?, ?)",
            [(1, 1000.0, 1001.0), (2, 1100.0, 1101.0), (3, 1200.0, 1201.0)],
        )
        conn.executemany(
            "INSERT INTO variables (name, title) VALUES (?, ?)",
            [("alpha", "Alpha Variable"), ("beta", "Beta Variable")],
        )
        conn.execute("INSERT INTO tags (id, name) VALUES (1, 'GroupA')")
        conn.execute(
            "INSERT INTO variable_tags (variable_name, tag_id) VALUES ('alpha', 1)"
        )
        conn.execute(
            "INSERT INTO metameta (key, value) VALUES ('proposal', ?)", (str(p),)
        )
        conn.commit()
    finally:
        conn.close()


@pytest_asyncio.fixture
async def repo(mocker, tmp_path):
    _seed(tmp_path / "runs.sqlite")
    mocker.patch(
        "damnit_api.runs.sqlite.session.get_damnit_path",
        return_value=str(tmp_path),
    )
    instance = SQLiteDamnitRepository(_TEST_PROPOSAL)
    yield instance
    await instance._db.close()


# -----------------------------------------------------------------------------
# get_runs


@pytest.mark.asyncio
async def test_get_runs_returns_all_runs(repo):
    records = await repo.get_runs(limit=10, offset=0)
    assert [r.run for r in records] == [1, 2, 3]


@pytest.mark.asyncio
async def test_get_runs_picks_latest_timestamp(repo):
    records = await repo.get_runs(limit=10, offset=0)
    run1 = next(r for r in records if r.run == 1)
    assert run1.variables["alpha"].value == "a1"
    assert run1.variables["alpha"].timestamp == pytest.approx(1000.0)


@pytest.mark.asyncio
async def test_get_runs_pagination(repo):
    page1 = await repo.get_runs(limit=2, offset=0)
    page2 = await repo.get_runs(limit=2, offset=2)
    assert [r.run for r in page1] == [1, 2]
    assert [r.run for r in page2] == [3]


@pytest.mark.asyncio
async def test_get_runs_name_filter(repo):
    records = await repo.get_runs(limit=10, offset=0, variable_names=["alpha"])
    run1 = next(r for r in records if r.run == 1)
    assert set(run1.variables) == {"alpha"}


@pytest.mark.asyncio
async def test_get_runs_includes_run_info(repo):
    records = await repo.get_runs(limit=10, offset=0)
    run2 = next(r for r in records if r.run == 2)
    assert run2.start_time == pytest.approx(1100.0)
    assert run2.added_at == pytest.approx(1101.0)


# -----------------------------------------------------------------------------
# get_latest_runs


@pytest.mark.asyncio
async def test_get_latest_runs_after_cutoff(repo):
    records = await repo.get_latest_runs(start_at=1050.0)
    assert [r.run for r in records] == [2, 3]


@pytest.mark.asyncio
async def test_get_latest_runs_future_cutoff_empty(repo):
    assert await repo.get_latest_runs(start_at=9999.0) == []


# -----------------------------------------------------------------------------
# get_metadata


@pytest.mark.asyncio
async def test_get_metadata_runs_and_timestamp(repo):
    snap = await repo.get_metadata()
    assert snap.runs == (1, 2, 3)
    assert snap.timestamp == pytest.approx(1200.0)


@pytest.mark.asyncio
async def test_get_metadata_variables_and_tags(repo):
    snap = await repo.get_metadata()
    known = {v.name for v in KNOWN_VARIABLES}
    assert known <= set(snap.variables)
    assert snap.variables["alpha"].title == "Alpha Variable"
    assert "GroupA" in snap.tags
    assert "alpha" in snap.tags["GroupA"].variables
    assert "beta" in snap.tags["(Untagged)"].variables


@pytest.mark.asyncio
async def test_get_metadata_ttl_cache(repo):
    """Within the TTL, get_metadata returns the same cached object; invalidating
    forces a fresh snapshot."""
    first = await repo.get_metadata()
    assert await repo.get_metadata() is first
    repo.invalidate_metadata_cache()
    assert await repo.get_metadata() is not first


# -----------------------------------------------------------------------------
# get_proposal_number (local-mode metameta lookup)


@pytest.mark.asyncio
async def test_get_proposal_number_reads_metameta(repo):
    assert await repo.get_proposal_number() == str(int(_TEST_PROPOSAL))
