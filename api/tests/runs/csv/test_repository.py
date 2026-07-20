"""Tests for CsvDamnitRepository."""

from __future__ import annotations

import pytest

from damnit_api.runs.csv import CsvDamnitRepository
from damnit_api.runs.models import KNOWN_VARIABLES
from damnit_api.shared.models import ProposalNumber

_TEST_PROPOSAL = ProposalNumber(999997)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def csv_dir(tmp_path):
    """Populate tmp_path with a representative set of CSV fixture files."""
    (tmp_path / "runs.csv").write_text(
        "run,start_time,added_at\n1,1000.0,1001.0\n2,1100.0,1101.0\n3,1200.0,1201.0\n",
        encoding="utf-8",
    )
    (tmp_path / "run_variables.csv").write_text(
        "run,name,value,summary_type,timestamp\n"
        "1,alpha,a1,,1000.0\n"
        "1,beta,b1,,1000.0\n"
        "2,alpha,a2,,1100.0\n"
        "3,beta,b3,,1200.0\n"
        # Extra timestamp for run 1 / alpha (older — should be ignored)
        "1,alpha,a1_old,,900.0\n",
        encoding="utf-8",
    )
    (tmp_path / "variables.csv").write_text(
        "name,title,tags\nalpha,Alpha Variable,GroupA\nbeta,Beta Variable,\n",
        encoding="utf-8",
    )
    return tmp_path


@pytest.fixture
def repo(csv_dir):
    return CsvDamnitRepository(_TEST_PROPOSAL, csv_dir)


# ---------------------------------------------------------------------------
# get_runs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_runs_returns_all_runs(repo):
    records = await repo.get_runs(limit=10, offset=0)
    assert [r.run for r in records] == [1, 2, 3]


@pytest.mark.asyncio
async def test_get_runs_picks_latest_timestamp(repo):
    """run 1 / alpha has two timestamps; only the newer value should appear."""
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
async def test_get_runs_filter_by_variable_name(repo):
    """Filtering by 'alpha' keeps only variables named alpha; other variables
    are absent but all runs are still returned."""
    records = await repo.get_runs(limit=10, offset=0, variable_names=["alpha"])
    assert [r.run for r in records] == [1, 2, 3]
    run1 = next(r for r in records if r.run == 1)
    assert "alpha" in run1.variables
    assert "beta" not in run1.variables
    run3 = next(r for r in records if r.run == 3)
    assert run3.variables == {}


@pytest.mark.asyncio
async def test_get_runs_unknown_variable_name_returns_empty_variables(repo):
    records = await repo.get_runs(limit=10, offset=0, variable_names=["nonexistent"])
    assert [r.run for r in records] == [1, 2, 3]
    assert all(r.variables == {} for r in records)


@pytest.mark.asyncio
async def test_get_runs_includes_run_info(repo):
    records = await repo.get_runs(limit=10, offset=0)
    run2 = next(r for r in records if r.run == 2)
    assert run2.start_time == pytest.approx(1100.0)
    assert run2.added_at == pytest.approx(1101.0)


@pytest.mark.asyncio
async def test_get_runs_missing_run_variables_csv(tmp_path):
    """If run_variables.csv is absent, return an empty list."""
    (tmp_path / "runs.csv").write_text("run,start_time,added_at\n1,1000.0,1001.0\n")
    repo = CsvDamnitRepository(_TEST_PROPOSAL, tmp_path)
    records = await repo.get_runs(limit=10, offset=0)
    assert records == []


# ---------------------------------------------------------------------------
# get_latest_runs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_latest_runs_returns_rows_after_cutoff(repo):
    records = await repo.get_latest_runs(start_at=1050.0)
    assert [r.run for r in records] == [2, 3]


@pytest.mark.asyncio
async def test_get_latest_runs_future_cutoff_returns_empty(repo):
    records = await repo.get_latest_runs(start_at=9999.0)
    assert records == []


@pytest.mark.asyncio
async def test_get_latest_runs_deduplicates_per_variable(repo):
    """run 1 / alpha has timestamps 900 and 1000; start_at=0 includes both
    rows but keeps only the latest value."""
    records = await repo.get_latest_runs(start_at=0.0)
    run1 = next(r for r in records if r.run == 1)
    assert run1.variables["alpha"].timestamp == pytest.approx(1000.0)
    assert run1.variables["alpha"].value == "a1"


@pytest.mark.asyncio
async def test_get_latest_runs_includes_run_info(repo):
    records = await repo.get_latest_runs(start_at=0.0)
    run3 = next(r for r in records if r.run == 3)
    assert run3.start_time == pytest.approx(1200.0)
    assert run3.added_at == pytest.approx(1201.0)


@pytest.mark.asyncio
async def test_get_latest_runs_start_at_none_returns_empty(repo):
    """start_at=None substitutes current time, so old rows are excluded."""
    records = await repo.get_latest_runs(start_at=None)
    assert records == []


@pytest.mark.asyncio
async def test_get_latest_runs_missing_csv(tmp_path):
    repo = CsvDamnitRepository(_TEST_PROPOSAL, tmp_path)
    records = await repo.get_latest_runs(start_at=0.0)
    assert records == []


# ---------------------------------------------------------------------------
# get_metadata
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_metadata_runs_list(repo):
    snap = await repo.get_metadata()
    assert snap.runs == (1, 2, 3)


@pytest.mark.asyncio
async def test_get_metadata_includes_known_variables(repo):
    snap = await repo.get_metadata()
    known_names = {v.name for v in KNOWN_VARIABLES}
    assert known_names.issubset(snap.variables.keys())


@pytest.mark.asyncio
async def test_get_metadata_db_variables_have_titles(repo):
    snap = await repo.get_metadata()
    assert snap.variables["alpha"].title == "Alpha Variable"
    assert snap.variables["beta"].title == "Beta Variable"


@pytest.mark.asyncio
async def test_get_metadata_tags(repo):
    snap = await repo.get_metadata()
    assert "(Untagged)" in snap.tags
    assert "GroupA" in snap.tags
    assert "alpha" in snap.tags["GroupA"].variables


@pytest.mark.asyncio
async def test_get_metadata_untagged_contains_beta(repo):
    snap = await repo.get_metadata()
    assert "beta" in snap.tags["(Untagged)"].variables


@pytest.mark.asyncio
async def test_get_metadata_timestamp(repo):
    snap = await repo.get_metadata()
    assert snap.timestamp == pytest.approx(1200.0)


@pytest.mark.asyncio
async def test_get_metadata_missing_variables_csv(tmp_path):
    """Without variables.csv only known variables appear; no named tags."""
    (tmp_path / "runs.csv").write_text(
        "run,start_time,added_at\n1,1000.0,1001.0\n", encoding="utf-8"
    )
    (tmp_path / "run_variables.csv").write_text(
        "run,name,value,summary_type,timestamp\n1,alpha,a1,,1000.0\n",
        encoding="utf-8",
    )
    repo = CsvDamnitRepository(_TEST_PROPOSAL, tmp_path)
    snap = await repo.get_metadata()
    known_names = {v.name for v in KNOWN_VARIABLES}
    assert known_names.issubset(snap.variables.keys())
    assert "alpha" not in snap.variables
    assert list(snap.tags.keys()) == ["(Untagged)"]


@pytest.mark.asyncio
async def test_get_metadata_empty_runs_csv(tmp_path):
    """Empty runs.csv gives an empty runs list and zero timestamp."""
    (tmp_path / "runs.csv").write_text("run,start_time,added_at\n", encoding="utf-8")
    repo = CsvDamnitRepository(_TEST_PROPOSAL, tmp_path)
    snap = await repo.get_metadata()
    assert snap.runs == ()
    assert snap.timestamp == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# get_extracted_data
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_extracted_data_returns_none(repo):
    result = await repo.get_extracted_data(run=1, variable="alpha")
    assert result is None


# ---------------------------------------------------------------------------
# Multi-tag (T4)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_metadata_multi_tag_variable(tmp_path):
    """Semicolon-separated tags in a variables.csv row produce multiple tags."""
    (tmp_path / "runs.csv").write_text(
        "run,start_time,added_at\n1,1.0,2.0\n", encoding="utf-8"
    )
    (tmp_path / "run_variables.csv").write_text(
        "run,name,value,summary_type,timestamp\n1,gamma,g1,,1.0\n", encoding="utf-8"
    )
    (tmp_path / "variables.csv").write_text(
        "name,title,tags\ngamma,Gamma Variable,TagA;TagB\n", encoding="utf-8"
    )
    repo = CsvDamnitRepository(_TEST_PROPOSAL, tmp_path)
    snap = await repo.get_metadata()
    assert "TagA" in snap.tags
    assert "TagB" in snap.tags
    assert "gamma" in snap.tags["TagA"].variables
    assert "gamma" in snap.tags["TagB"].variables
