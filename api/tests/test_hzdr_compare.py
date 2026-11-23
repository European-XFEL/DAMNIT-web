# h5py's `Group.__getitem__` is typed as Group | Dataset | Datatype, so every
# `handle["entry/..."]` in a test needs narrowing pyright cannot infer.
# pyright: reportIndexIssue=false, reportAttributeAccessIssue=false
"""Comparing DAMNIT's shot containers with shot-aligner's (plan phase 6).

The end-to-end case is the rehearsal of phase 6 on the reference shot: DAMNIT
builds its container from the fixture's events, shot-aligner builds its own
from the same raws with its production `build_shot`, and the two compare equal
apart from the documented differences. It needs a shot-aligner checkout with
its environment (`SHOT_ALIGNER_ROOT`, else `../shot-aligner`) and skips
without one, like the sync checks.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess  # noqa: S404 -- fixed interpreters and scripts
import sys
from pathlib import Path

import h5py
import pytest

from damnit_api.metadata import hzdr_containers as hc
from damnit_api.metadata.hzdr_compare import IGNORED, compare

from .test_hzdr_containers import CONTAINER, FIXTURE, _build_master, _read_path
from .test_hzdr_containers import _fixture_events as events

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "api" / "scripts" / "hzdr-compare-containers.py"


def _shot_aligner() -> tuple[Path, str] | None:
    root = Path(os.environ.get("SHOT_ALIGNER_ROOT") or REPO.parent / "shot-aligner")
    bin_dir = "Scripts" if sys.platform == "win32" else "bin"
    python = root / ".venv" / bin_dir / "python"
    generator = root / "shot_aligner" / "scripts" / "make_reference_fixture.py"
    if python.is_file() and generator.is_file():
        return root, str(python)
    return None


SHOT_ALIGNER = _shot_aligner()


@pytest.fixture(scope="module")
def damnit_campaign(tmp_path_factory) -> Path:
    """The reference shot as DAMNIT builds it: master and container."""
    out = tmp_path_factory.mktemp("damnit")
    master = _build_master(out / "unassigned.nxs", events())
    hc.convert_campaign(master, read_path=_read_path(FIXTURE / "raw"))
    return out


@pytest.fixture
def container(damnit_campaign, tmp_path) -> Path:
    copy = tmp_path / CONTAINER
    shutil.copy(damnit_campaign / "shots" / CONTAINER, copy)
    return copy


def _cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(  # noqa: S603
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def test_a_container_equals_itself(container, damnit_campaign):
    result = compare(container, damnit_campaign / "shots" / CONTAINER)
    assert result.equal
    assert len(result.same) > 100
    assert not result.different


def test_a_changed_value_is_a_difference(container, damnit_campaign):
    path = "/entry/Probe_135_deg/pco_Camera/local_name"
    with h5py.File(container, "r+") as handle:
        del handle[path]
        handle[path] = "something else"
    result = compare(container, damnit_campaign / "shots" / CONTAINER)
    assert not result.equal
    assert path in result.different
    assert "value" in result.different[path]


def test_a_missing_node_is_reported_on_its_side(container, damnit_campaign):
    with h5py.File(container, "r+") as handle:
        handle["entry/Probe_135_deg/pco_Camera"].create_dataset("extra", data=1)
    result = compare(container, damnit_campaign / "shots" / CONTAINER)
    assert result.only_damnit == ["/entry/Probe_135_deg/pco_Camera/extra"]
    reverse = compare(damnit_campaign / "shots" / CONTAINER, container)
    assert reverse.only_aligner == ["/entry/Probe_135_deg/pco_Camera/extra"]


def test_an_ignored_node_differs_without_failing_and_says_why(
    container, damnit_campaign
):
    with h5py.File(container, "r+") as handle:
        del handle["entry/title"]
        handle["entry/title"] = "another builder's title"
    result = compare(container, damnit_campaign / "shots" / CONTAINER)
    assert result.equal
    assert result.ignored["/entry/title"] == "each builder's own naming of the shot"


def test_every_ignore_rule_gives_a_reason():
    for rule, reason in IGNORED:
        assert callable(rule)
        assert len(reason) > 20


def test_start_time_is_one_instant_within_the_tolerance(container, damnit_campaign):
    with h5py.File(container, "r+") as handle:
        written = handle["entry/start_time"].asstr()[()]
    assert written.endswith("+00:00")
    for shifted, equal in (("+01:00", True), ("+02:00", False)):
        moved = written.replace("T14:", "T15:").replace("+00:00", shifted)
        with h5py.File(container, "r+") as handle:
            del handle["entry/start_time"]
            handle["entry/start_time"] = moved
        result = compare(container, damnit_campaign / "shots" / CONTAINER)
        assert ("/entry/start_time" not in result.different) is equal, moved


def test_a_start_time_without_an_offset_is_the_campaign_wall_clock(
    container, damnit_campaign, tmp_path
):
    """Older shot-aligner containers wrote Berlin time with no offset: on
    fwkt-webapps Vanlife 12-03 read 15:21:38 for DAMNIT's 14:21:38+00:00 and
    no pair formed (2026-11-23)."""
    with h5py.File(container, "r+") as handle:
        written = handle["entry/start_time"].asstr()[()]
    assert written.startswith("2025-12-")
    assert written.endswith("+00:00")
    for bare, equal in (
        (written.replace("T14:", "T15:")[:-6], True),
        (written[:-6], False),
    ):
        with h5py.File(container, "r+") as handle:
            del handle["entry/start_time"]
            handle["entry/start_time"] = bare
        result = compare(container, damnit_campaign / "shots" / CONTAINER)
        assert ("/entry/start_time" not in result.different) is equal, bare

    aligner = tmp_path / "aligner"
    aligner.mkdir()
    old = aligner / "2025_12_03_set1_shot001.h5"
    shutil.copy(damnit_campaign / "shots" / CONTAINER, old)
    with h5py.File(old, "r+") as handle:
        del handle["entry/start_time"]
        handle["entry/start_time"] = written.replace("T14:", "T15:")[:-6]
    paired = _cli("--damnit", str(damnit_campaign), "--aligner", str(aligner))
    assert f"{CONTAINER} ~ {old.name}" in paired.stdout, paired.stdout + paired.stderr


def test_folders_pair_by_start_time_and_report_the_unpaired(damnit_campaign, tmp_path):
    aligner = tmp_path / "aligner"
    aligner.mkdir()
    shutil.copy(damnit_campaign / "shots" / CONTAINER, aligner / "set1_shot1042.h5")
    stray = aligner / "set1_shot1043.h5"
    with h5py.File(stray, "w") as handle:
        handle["entry/start_time"] = "2025-12-01T15:30:00+00:00"
    report = tmp_path / "report.json"
    result = _cli(
        "--damnit",
        str(damnit_campaign),
        "--aligner",
        str(aligner),
        "--json",
        str(report),
    )
    assert result.returncode == 1, result.stdout + result.stderr
    assert f"{CONTAINER} ~ set1_shot1042.h5: equal" in result.stdout
    assert "set1_shot1043.h5: no DAMNIT container" in result.stdout
    written = json.loads(report.read_text(encoding="utf-8"))
    assert written["passed"] is False
    assert written["unpaired_aligner"] == [str(stray)]
    allowed = _cli(
        "--damnit", str(damnit_campaign), "--aligner", str(aligner), "--allow-unpaired"
    )
    assert allowed.returncode == 0, allowed.stdout


def test_a_pairs_file_overrides_the_clock(damnit_campaign, tmp_path):
    aligner = tmp_path / "aligner"
    aligner.mkdir()
    target = aligner / "far_off.h5"
    shutil.copy(damnit_campaign / "shots" / CONTAINER, target)
    with h5py.File(target, "r+") as handle:
        del handle["entry/start_time"]
        handle["entry/start_time"] = "2025-12-01T18:00:00+00:00"
    pairs = tmp_path / "pairs.csv"
    pairs.write_text(f"damnit,aligner\nshots/{CONTAINER},far_off.h5\n", "utf-8")
    by_time = _cli("--damnit", str(damnit_campaign), "--aligner", str(aligner))
    assert by_time.returncode == 1
    by_csv = _cli(
        "--damnit",
        str(damnit_campaign),
        "--aligner",
        str(aligner),
        "--pairs",
        str(pairs),
    )
    # Paired by hand, the clock is the one difference left.
    assert by_csv.returncode == 1
    assert "/entry/start_time [value]" in by_csv.stdout
    assert "only in DAMNIT:" not in by_csv.stdout
    assert "only in shot-aligner:" not in by_csv.stdout


def test_a_missing_input_could_not_run(tmp_path):
    result = _cli("--damnit", str(tmp_path / "nope"), "--aligner", str(tmp_path))
    assert result.returncode == 2
    assert "could not run" in result.stderr
    empty = _cli("--damnit", str(tmp_path), "--aligner", str(tmp_path))
    assert empty.returncode == 2


@pytest.mark.skipif(
    SHOT_ALIGNER is None,
    reason="no shot-aligner checkout with its .venv (set SHOT_ALIGNER_ROOT)",
)
def test_damnit_and_shot_aligner_build_the_reference_shot_alike(
    damnit_campaign, tmp_path
):
    """Phase 6 on the reference shot: the two builds differ only as documented."""
    assert SHOT_ALIGNER is not None
    root, python = SHOT_ALIGNER
    out = tmp_path / "aligner"
    out.mkdir()
    build = subprocess.run(  # noqa: S603
        [
            python,
            "-c",
            (
                "import sys; from pathlib import Path; "
                "sys.path[:0] = ['shot_aligner/scripts']; "
                "import make_reference_fixture as m; "
                "print(m.build(m.FIXTURE / 'raw', Path(sys.argv[1])))"
            ),
            str(out),
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert build.returncode == 0, build.stdout + build.stderr
    built = Path(build.stdout.strip().splitlines()[-1])
    result = compare(damnit_campaign / "shots" / CONTAINER, built)
    assert result.equal, (result.different, result.only_damnit, result.only_aligner)
    assert len(result.same) > 100
