"""An unchanged campaign is not rewritten on the share (plan-quiet-builds Q1)."""

from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess  # noqa: S404
import sys
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "hzdr-aligner"
SCRIPT = Path(__file__).parents[1] / "scripts" / "hzdr-hdf5-builder.py"
VANLIFE = "Vanlife_12.2025"
OTHER = "Other_2026"


@pytest.fixture
def index_dir(tmp_path: Path) -> Path:
    folder = tmp_path / "index"
    folder.mkdir()
    for name in ("2025_12_03.index.json", "2025_12_03.decisions.json"):
        shutil.copy(FIXTURES / name, folder)
    return folder


def _build(tmp_path: Path, index_dir: Path, *extra: str) -> str:
    events = tmp_path / "events.jsonl"
    if not events.exists():
        events.write_text("")
    result = subprocess.run(  # noqa: S603
        [
            sys.executable, str(SCRIPT),
            "--experiment-id", VANLIFE,
            "--campaign-timezone", "Europe/Berlin",
            "--events-jsonl", str(events),
            "--output-nexus", str(tmp_path / "out" / f"{VANLIFE}.nxs"),
            "--aligner-index-dir", str(index_dir),
            "--aligner-campaign", f"{VANLIFE}=2025_12_03",
            *extra,
        ],
        capture_output=True, text=True, check=False,
    )  # fmt: skip
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout


def _master(tmp_path: Path) -> Path:
    return tmp_path / "out" / f"{VANLIFE}.nxs"


def test_a_second_identical_build_writes_nothing(tmp_path, index_dir):
    assert "unchanged" not in _build(tmp_path, index_dir)
    written = _master(tmp_path).stat().st_mtime_ns
    catalog = (tmp_path / "out" / "hzdr_sources.json").stat().st_mtime_ns
    assert "unchanged, not rewritten" in _build(tmp_path, index_dir)
    assert _master(tmp_path).stat().st_mtime_ns == written
    assert (tmp_path / "out" / "hzdr_sources.json").stat().st_mtime_ns == catalog
    # --force rewrites it anyway.
    assert "unchanged" not in _build(tmp_path, index_dir, "--force")
    assert _master(tmp_path).stat().st_mtime_ns != written


def _new_event(tmp_path: Path, index_dir: Path) -> None:
    del index_dir
    trigger = {
        "schema_version": "hzdr-event-v1", "event_id": "trigger-1",
        "experiment_id": VANLIFE, "shot_id": "shot-000001", "shot_number": None,
        "source": "DRACO-Trigger", "kind": "draco.trigger",
        "timestamp": "2025-12-03T14:22:10Z", "transport": "kafka",
        "payload_ref": {"topic": "t", "partition": 0, "offset": 1}, "metadata": {},
    }  # fmt: skip
    (tmp_path / "events.jsonl").write_text(json.dumps(trigger) + "\n")


def _new_decision(tmp_path: Path, index_dir: Path) -> None:
    del tmp_path
    path = index_dir / "2025_12_03.decisions.json"
    decisions = json.loads(path.read_text())
    decisions["links"]["set1:2"]["action"] = "reject"
    path.write_text(json.dumps(decisions))


def _new_container(tmp_path: Path, index_dir: Path) -> None:
    del index_dir
    shots = tmp_path / "out" / "shots"
    shots.mkdir(exist_ok=True)
    (shots / ".build-manifest.json").write_text('{"containers": {}}')


def _master_removed(tmp_path: Path, index_dir: Path) -> None:
    del index_dir
    _master(tmp_path).unlink()


@pytest.mark.parametrize(
    "change", [_new_event, _new_decision, _new_container, _master_removed]
)
def test_any_change_publishes_again(tmp_path, index_dir, change):
    _build(tmp_path, index_dir)
    change(tmp_path, index_dir)
    assert "unchanged" not in _build(tmp_path, index_dir)
    assert _master(tmp_path).is_file()


def test_a_code_change_is_never_skipped(monkeypatch):
    spec = importlib.util.spec_from_file_location("quiet_builder", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    builder = importlib.util.module_from_spec(spec)
    sys.modules["quiet_builder"] = builder
    spec.loader.exec_module(builder)

    import argparse

    args = argparse.Namespace(
        source_key=VANLIFE, labfrog_nexus=None, never_shot_kind=[]
    )
    kwargs = {
        "experiment_id": VANLIFE,
        "shots": [{"shot_key": "a"}],
        "events": [],
        "output_nexus": Path("/nowhere/x.nxs"),
        "merge_catalog": False,
        "catalog_title": None,
    }
    before = builder._result_digest(args, **kwargs)
    assert builder._result_digest(args, **kwargs) == before
    monkeypatch.setattr(builder, "_code_digest", lambda: "another version")
    assert builder._result_digest(args, **kwargs) != before


def test_multi_campaign_rewrites_only_the_campaign_that_changed(tmp_path, index_dir):
    spool = tmp_path / "spool"
    (spool / OTHER).mkdir(parents=True)
    trigger = {
        "schema_version": "hzdr-event-v1", "event_id": "o-1", "experiment_id": OTHER,
        "shot_id": "shot-000001", "shot_number": 1, "source": "DRACO-Trigger",
        "kind": "draco.trigger", "timestamp": "2026-06-10T12:01:00Z",
        "transport": "kafka",
        "payload_ref": {"topic": "t", "partition": 0, "offset": 1},
        "metadata": {},
    }  # fmt: skip
    (spool / OTHER / "events.jsonl").write_text(json.dumps(trigger) + "\n")
    root = tmp_path / "nexus"

    def build() -> str:
        result = subprocess.run(  # noqa: S603
            [
                sys.executable, str(SCRIPT),
                "--output-root", str(root),
                "--campaign-timezone", "Europe/Berlin",
                "--events-spool", str(spool), "events.jsonl",
                "--aligner-index-dir", str(index_dir),
                "--aligner-campaign", f"{VANLIFE}=2025_12_03",
            ],
            capture_output=True, text=True, check=False,
        )  # fmt: skip
        assert result.returncode == 0, result.stdout + result.stderr
        return result.stdout

    build()
    vanlife = root / VANLIFE / f"{VANLIFE}.nxs"
    written = vanlife.stat().st_mtime_ns
    # Today's campaign gets a new trigger; Vanlife has nothing new.
    second = dict(trigger, event_id="o-2", shot_id="shot-000002", shot_number=2)
    second["timestamp"] = "2026-06-10T12:02:00Z"
    with (spool / OTHER / "events.jsonl").open("a") as handle:
        handle.write(json.dumps(second) + "\n")
    out = build()
    assert f"({VANLIFE}): unchanged, not rewritten" in out
    assert f"({OTHER}): unchanged" not in out
    assert vanlife.stat().st_mtime_ns == written
    catalog = json.loads((root / "hzdr_sources.json").read_text())
    keys = {source["key"] for source in catalog["sources"]}
    assert {VANLIFE, OTHER} <= keys
    other = next(s for s in catalog["sources"] if s["key"] == OTHER)
    assert len(other["shots"]) == 2
