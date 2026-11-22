"""The console script (hzdr/docs/plans/plan-backfill-store-and-console.md, G4)."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "hzdr-aligner"
SCRIPT = Path(__file__).parents[1] / "scripts" / "hzdr-campaign-backfill.py"
VANLIFE = "Vanlife_12.2025"


def _module():
    spec = importlib.util.spec_from_file_location("hzdr_campaign_backfill", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["hzdr_campaign_backfill"] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def index_dir(tmp_path: Path) -> Path:
    folder = tmp_path / "index"
    folder.mkdir()
    for name in ("2025_12_03.index.json", "2025_12_03.decisions.json"):
        shutil.copy(FIXTURES / name, folder)
    # The index written after the decisions, as shot-aligner writes it.
    index = folder / "2025_12_03.index.json"
    later = (folder / "2025_12_03.decisions.json").stat().st_mtime_ns + 1_000_000_000
    os.utime(index, ns=(later, later))
    return folder


def _config(
    module, index_dir: Path, tmp_path: Path, dates=("2025_12_03", "2025_12_05")
):
    return module.Config(
        index_dir=index_dir,
        campaigns={VANLIFE: list(dates)},
        output_root=tmp_path / "nexus",
        shot_aligner=tmp_path / "shot-aligner",
        uv="uv",
        from_settings=False,
    )


def test_the_report_before_anything_is_built(index_dir, tmp_path):
    module = _module()
    states = module.date_states(_config(module, index_dir, tmp_path))
    built, missing = states
    assert (built.date_folder, built.has_index, built.confirmed, built.links) == (
        "2025_12_03",
        True,
        3,
        3,
    )
    assert built.shotsheet_shots == 3
    assert (built.stored, built.shots, built.attached) == (False, 0, 0)
    assert not missing.has_index
    lines: list[str] = []
    step = module.print_report(states, lines.append)
    assert "MISSING" in lines[2]
    assert step.startswith("build the day index of 2025_12_05")


def _record(codes: dict[str, int] | None = None):
    """A runner that records each command and answers by the script it runs."""
    calls: list[tuple[list[str], Path | None]] = []

    def run(cmd, cwd):
        calls.append((list(cmd), cwd))
        name = next((Path(part).name for part in cmd if part.endswith(".py")), "")
        return (codes or {}).get(name, 0)

    return calls, run


def _names(calls) -> list[str]:
    return [next(Path(p).name for p in cmd if p.endswith(".py")) for cmd, _ in calls]


def test_apply_runs_the_steps_in_order(index_dir, tmp_path):
    module = _module()
    config = _config(module, index_dir, tmp_path)
    calls, run = _record({"hzdr-container-worker.py": 3})
    failed = module.apply(
        config,
        module.date_states(config),
        aligner_build=tmp_path / "aligner",
        run=run,
    )
    assert failed == 0
    assert _names(calls) == [
        "align.py",  # 2025_12_05 has no index
        "hzdr-hdf5-builder.py",
        "hzdr-container-worker.py",
        "hzdr-hdf5-builder.py",  # the worker asked for its containers to be linked
        "hzdr-compare-containers.py",
    ]
    index_cmd, cwd = calls[0]
    assert cwd == tmp_path / "shot-aligner"
    assert index_cmd[-3:] == ["index", "2025_12_05", "--if-changed"]
    assert "--site" in index_cmd
    rebuild = calls[1][0]
    assert f"{VANLIFE}=2025_12_03" in rebuild
    assert str(index_dir) in rebuild
    master = calls[2][0][-1]
    assert master.endswith(f"{VANLIFE}/{VANLIFE}.nxs")


@pytest.mark.parametrize(
    ("codes", "step", "ran"),
    [
        ({"align.py": 1}, 1, ["align.py"]),
        ({"hzdr-hdf5-builder.py": 1}, 2, ["align.py", "hzdr-hdf5-builder.py"]),
        (
            {"hzdr-container-worker.py": 1},
            3,
            ["align.py", "hzdr-hdf5-builder.py", "hzdr-container-worker.py"],
        ),
        (
            {"hzdr-compare-containers.py": 1},
            4,
            [
                "align.py",
                "hzdr-hdf5-builder.py",
                "hzdr-container-worker.py",
                "hzdr-compare-containers.py",
            ],
        ),
    ],
)
def test_a_failing_step_stops_the_ones_after_it(index_dir, tmp_path, codes, step, ran):
    module = _module()
    config = _config(module, index_dir, tmp_path)
    calls, run = _record(codes)
    failed = module.apply(
        config, module.date_states(config), aligner_build=tmp_path / "a", run=run
    )
    assert failed == step
    assert _names(calls) == ran


def test_from_settings_the_rebuild_is_the_triggers_own_command(index_dir, tmp_path):
    module = _module()
    config = _config(module, index_dir, tmp_path)
    config.from_settings = True
    assert Path(module.rebuild_command(config)[-1]).name == "hzdr-rebuild.py"


def test_a_real_run_builds_vanlife_and_reports_it(index_dir, tmp_path, capsys):
    """--apply for real on the fixture: rebuild, containers, links, report."""
    module = _module()
    code = module.main([
        "--apply",
        "--index-dir", str(index_dir),
        "--output-root", str(tmp_path / "nexus"),
        "--campaign", f"{VANLIFE}=2025_12_03",
        "--json", str(tmp_path / "report.json"),
    ])  # fmt: skip
    assert code == 0
    report = json.loads((tmp_path / "report.json").read_text())
    assert report == [
        {
            "campaign": VANLIFE,
            "date_folder": "2025_12_03",
            "index_age_h": report[0]["index_age_h"],
            "stale": False,
            "links": 3,
            "confirmed": 3,
            "shotsheet_shots": 3,
            "stored": True,
            "shots": 3,
            "attached": 9,
            "suggested": 0,
        }
    ]
    assert "nothing waits" in capsys.readouterr().out
    shots = tmp_path / "nexus" / VANLIFE / "shots"
    assert sorted(p.name for p in shots.glob("*.nxs")) == [
        "20251203_000001.nxs",
        "20251203_000002.nxs",
        "20251203_000003.nxs",
    ]


def test_without_an_index_folder_or_a_campaign_it_says_so(index_dir, monkeypatch):
    module = _module()
    from damnit_api.shared.settings import settings

    monkeypatch.setattr(settings.hzdr_builder, "aligner_index_dir", None)
    assert module.main([]) == 2
    assert module.main(["--index-dir", str(index_dir)]) == 2


def test_an_index_older_than_its_decisions_is_marked_and_rewritten(index_dir, tmp_path):
    module = _module()
    ledger = index_dir / "2025_12_03.decisions.json"
    later = (index_dir / "2025_12_03.index.json").stat().st_mtime_ns + 5_000_000_000
    os.utime(ledger, ns=(later, later))
    config = _config(module, index_dir, tmp_path, dates=("2025_12_03",))
    states = module.date_states(config)
    assert states[0].stale
    lines: list[str] = []
    module.print_report(states, lines.append)
    assert "*" in lines[1]
    assert any(line.startswith("* decisions newer") for line in lines)
    calls, run = _record()
    assert module.apply(config, states, run=run) == 0
    assert _names(calls)[0] == "align.py"
    assert calls[0][0][-3:] == ["index", "2025_12_03", "--if-changed"]


def test_package_is_the_last_step_when_asked(index_dir, tmp_path):
    module = _module()
    config = _config(module, index_dir, tmp_path, dates=("2025_12_03",))
    calls, run = _record({"hzdr-package-campaign.py": 1})
    failed = module.apply(config, module.date_states(config), package=True, run=run)
    assert _names(calls)[-1] == "hzdr-package-campaign.py"
    assert failed == 5
