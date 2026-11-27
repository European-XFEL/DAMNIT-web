# h5py's `Group.__getitem__` is typed as Group | Dataset | Datatype, so every
# `handle["entry/..."]` edited in a test needs narrowing pyright cannot infer.
# pyright: reportIndexIssue=false
"""The NeXus validation gate (campaign output phase 5) on the reference output.

The gate runs in nexus-design-studio's environment, which has pynxtools; this
suite runs it as a subprocess with that Python when it is found
(``HZDR_NDS_PYTHON``, else ``../nexus-design-studio/.venv/bin/python``) and
skips otherwise, like the shot-aligner sync checks without their sibling.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess  # noqa: S404 -- a fixed interpreter and script
import sys
from pathlib import Path

import h5py
import pytest

from damnit_api.metadata import hzdr_containers as hc

from .test_hzdr_containers import FIXTURE, _build_master, _fixture_events, _read_path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "api" / "scripts" / "hzdr-nexus-validate.py"


def _nds_python() -> str | None:
    configured = os.environ.get("HZDR_NDS_PYTHON")
    candidates = [configured] if configured else []
    bin_dir = "Scripts" if sys.platform == "win32" else "bin"
    candidates.append(
        str(REPO.parent / "nexus-design-studio" / ".venv" / bin_dir / "python")
    )
    for python in candidates:
        if not python or not Path(python).is_file():
            continue
        probe = subprocess.run(  # noqa: S603
            [python, "-c", "import pynxtools, nexus_design_studio"],
            capture_output=True,
            check=False,
        )
        if probe.returncode == 0:
            return python
    return None


NDS_PYTHON = _nds_python()
needs_nds = pytest.mark.skipif(
    NDS_PYTHON is None,
    reason="no nexus-design-studio Python with pynxtools (set HZDR_NDS_PYTHON)",
)


def _script():
    """The gate as a module, for what needs neither NDS nor pynxtools."""
    spec = importlib.util.spec_from_file_location("hzdr_nexus_validate", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _gate(*args: str, python: str | None = None) -> subprocess.CompletedProcess:
    python = python or NDS_PYTHON
    assert python is not None
    return subprocess.run(  # noqa: S603
        [python, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture(scope="module")
def reference_output(tmp_path_factory) -> Path:
    """The reference shot as the live flow builds it: master, container, links."""
    out = tmp_path_factory.mktemp("validated")
    master = _build_master(out / "unassigned.nxs", _fixture_events())
    hc.convert_campaign(master, read_path=_read_path(FIXTURE / "raw"))
    _build_master(master, _fixture_events())  # now linking the container
    return master


@needs_nds
def test_the_reference_output_passes_the_gate(reference_output):
    result = _gate("--master", str(reference_output))
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Validation (unassigned.nxs): passed" in result.stdout
    report = json.loads(
        (reference_output.parent / ".validation.json").read_text(encoding="utf-8")
    )
    summary = report["summary"]
    assert summary["master_errors"] == 0
    assert summary["containers"] == 1
    assert summary["container_errors"] == 0
    entries = report["result"]["entries"]
    assert entries == [{"entry": "entry", "definition": "NXhzdr_target", "valid": True}]


@needs_nds
def test_the_irr8_subentry_is_reported_with_what_it_lacks(reference_output):
    """Not certified yet: the concepts it lacks are mapping decisions."""
    result = _gate("--master", str(reference_output), "--no-write", "--json")
    report = json.loads(result.stdout[result.stdout.index("[") :])[0]
    container = report["containers"]["20251201_001042.nxs"]
    sub = container["subentries"]["Reflected_515_Spectrometer"]
    assert sub["definition"] == "NXoptical_spectroscopy"
    assert sub["valid"] is False
    assert any("experiment_type" in m for m in sub["findings"]["required_missing"])
    strict = _gate(
        "--master", str(reference_output), "--no-write", "--strict-subentries"
    )
    assert strict.returncode == 1
    assert "FAILED" in strict.stdout


@needs_nds
def test_a_master_invalid_against_its_definition_fails_the_gate(
    reference_output, tmp_path
):
    bad = tmp_path / "bad.nxs"
    bad.write_bytes(reference_output.read_bytes())
    with h5py.File(bad, "r+") as handle:
        del handle["entry/start_time"]
        handle["entry/start_time"] = "not a date"
    result = _gate("--master", str(bad), "--no-write")
    assert result.returncode == 1
    assert "/entry is not valid against NXhzdr_target" in result.stdout
    # The findings are in the report, once: not echoed by pynxtools on stderr
    # as well, which the trigger's log also takes.
    assert "start_time" in result.stdout
    assert "start_time" not in result.stderr, result.stderr


@needs_nds
def test_a_structurally_broken_container_fails_the_gate(reference_output, tmp_path):
    folder = tmp_path / "campaign"
    (folder / "shots").mkdir(parents=True)
    master = folder / "campaign.nxs"
    master.write_bytes(reference_output.read_bytes())
    with h5py.File(folder / "shots" / "20251201_000001.nxs", "w") as handle:
        handle.create_group("not_an_entry")  # no NXentry, no classes
    result = _gate("--master", str(master), "--no-write")
    assert result.returncode == 1, result.stdout
    assert "20251201_000001.nxs:" in result.stdout


def test_without_nds_the_gate_says_it_could_not_run(reference_output, tmp_path):
    """Exit 2, not 1, and a report that does not read as a current pass."""
    folder = tmp_path / "c"
    folder.mkdir()
    master = folder / "c.nxs"
    master.write_bytes(reference_output.read_bytes())
    (folder / ".validation.json").write_text('{"summary": {"passed": true}}')
    result = _gate("--master", str(master), python=sys.executable)
    assert result.returncode == 2, result.stdout + result.stderr
    assert "could not run" in result.stderr
    report = json.loads((folder / ".validation.json").read_text(encoding="utf-8"))
    assert report["ran"] is False
    assert report["summary"]["passed"] is None


def test_a_missing_master_could_not_run(tmp_path):
    """Not a pass: exit 2, and an older passing report there is replaced."""
    folder = tmp_path / "c"
    folder.mkdir()
    (folder / ".validation.json").write_text('{"summary": {"passed": true}}')
    result = _gate("--master", str(folder / "c.nxs"), python=sys.executable)
    assert result.returncode == 2, result.stdout + result.stderr
    assert "no published master" in result.stdout
    report = json.loads((folder / ".validation.json").read_text(encoding="utf-8"))
    assert report["ran"] is False
    assert report["summary"]["passed"] is None
    nowhere = _gate("--master", str(tmp_path / "gone" / "x.nxs"), python=sys.executable)
    assert nowhere.returncode == 2
    assert not (tmp_path / "gone").exists()


def test_a_known_gap_is_known_only_for_its_definition():
    gate = _script()
    finding = "The required field /entry/Irr8/experiment_type hasn't been supplied."
    findings = {"required_missing": [finding], "other": []}
    assert gate._unexpected(findings, "NXoptical_spectroscopy") == []
    assert gate._unexpected(findings, "NXxrd_pan") == [finding]


def test_the_gate_prefers_nds_public_helpers():
    gate = _script()

    class OldNds:
        @staticmethod
        def _load_pynxtools_validator():
            return "private"

    class NewNds(OldNds):
        @staticmethod
        def load_pynxtools_validator():
            return "public"

    assert gate._nds_helper(OldNds, "load_pynxtools_validator")() == "private"
    assert gate._nds_helper(NewNds, "load_pynxtools_validator")() == "public"


def test_a_missing_output_root_could_not_run(tmp_path):
    result = _gate("--output-root", str(tmp_path / "nope"), python=sys.executable)
    assert result.returncode == 2


@needs_nds
def test_a_dangling_container_link_fails_the_gate(reference_output, tmp_path):
    folder = tmp_path / "campaign"
    folder.mkdir()
    master = folder / "campaign.nxs"
    master.write_bytes(reference_output.read_bytes())  # its shots/ is not here
    result = _gate("--master", str(master), "--no-write")
    assert result.returncode == 1, result.stdout
    assert "cannot be opened" in result.stdout


@needs_nds
def test_a_new_subentry_finding_fails_the_gate(reference_output, tmp_path):
    """The known gaps are reported; anything else in a subentry gates."""
    folder = tmp_path / "campaign"
    (folder / "shots").mkdir(parents=True)
    master = folder / "unassigned.nxs"
    master.write_bytes(reference_output.read_bytes())
    container = folder / "shots" / "20251201_001042.nxs"
    container.write_bytes(
        (reference_output.parent / "shots" / "20251201_001042.nxs").read_bytes()
    )
    with h5py.File(container, "r+") as handle:
        sub = handle["entry/Reflected_515_Spectrometer"]
        del sub["definition"]
        sub["definition"] = "NXno_such_definition"
    result = _gate("--master", str(master), "--no-write")
    assert result.returncode == 1, result.stdout
    assert "/entry/Reflected_515_Spectrometer:" in result.stdout


@needs_nds
def test_a_master_declaring_no_definition_fails_the_gate(reference_output, tmp_path):
    bare = tmp_path / "bare.nxs"
    bare.write_bytes(reference_output.read_bytes())
    with h5py.File(bare, "r+") as handle:
        del handle["entry/definition"]
    result = _gate("--master", str(bare), "--no-write")
    assert result.returncode == 1
    assert "no root entry declares a definition" in result.stdout


@needs_nds
def test_an_unreadable_master_fails_its_campaign_not_the_run(tmp_path):
    for name in ("a", "b"):
        (tmp_path / name).mkdir()
        (tmp_path / name / f"{name}.nxs").write_bytes(b"not hdf5")
    result = _gate("--output-root", str(tmp_path), "--no-write")
    assert result.returncode == 1
    assert result.stdout.count("could not be checked") == 2


@pytest.fixture(scope="module")
def pump_probe_master(tmp_path_factory) -> Path:
    """A v0.11 campaign with a probe delay: /entry beside the /pump_probe entry."""
    from .test_hzdr_nexus_pump_probe import _build, _shot

    out = tmp_path_factory.mktemp("pump_probe")
    return _build(
        out,
        [
            _shot(1, authority=101),
            _shot(2, authority=None),
            _shot(3, authority=103, delay=10.0),
        ],
    )


@needs_nds
def test_the_pump_probe_entry_is_checked_against_its_own_definition(
    pump_probe_master,
):
    """/entry stays valid; /pump_probe is rechecked around pynxtools' enum-array bug."""
    result = _gate("--master", str(pump_probe_master), "--no-write", "--json")
    assert result.returncode == 0, result.stdout + result.stderr
    report = json.loads(result.stdout[result.stdout.index("[") :])[0]
    entries = {e["entry"]: e for e in report["result"]["entries"]}
    assert entries["entry"]["valid"] is True
    assert entries["pump_probe"]["definition"] == "NXlaser_pump_probe_hzdr_draco"
    assert entries["pump_probe"]["valid"] is True
    assert report["result"]["errors"] == []
    rechecked = report["result"]["rechecked"]["pump_probe"]
    assert rechecked["findings"] == []
    assert "/pump_probe/events/status" in rechecked["enum_arrays_checked_by_gate"]
    assert report["summary"]["entries_rechecked"] == 1


@needs_nds
def test_an_off_enum_status_fails_the_gate(pump_probe_master, tmp_path):
    bad = tmp_path / "bad.nxs"
    bad.write_bytes(pump_probe_master.read_bytes())
    with h5py.File(bad, "r+") as handle:
        del handle["pump_probe/events/status"]
        handle["pump_probe/events"].create_dataset(
            "status", data=["shot", "exploded"], dtype=h5py.string_dtype()
        )
    result = _gate("--master", str(bad), "--no-write")
    assert result.returncode == 1
    assert "'exploded' at /pump_probe/events/status" in result.stdout


@needs_nds
def test_a_new_pump_probe_finding_fails_the_gate(pump_probe_master, tmp_path):
    bad = tmp_path / "bad.nxs"
    bad.write_bytes(pump_probe_master.read_bytes())
    with h5py.File(bad, "r+") as handle:
        del handle["pump_probe/instrument/synchronization/scheme"]
    result = _gate("--master", str(bad), "--no-write")
    assert result.returncode == 1
    assert "/pump_probe is not valid against" in result.stdout
