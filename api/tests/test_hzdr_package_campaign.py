"""A campaign packaged on bigdata (hzdr/docs/plans/plan-campaign-package.md)."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess  # noqa: S404
import sys
import tarfile
from pathlib import Path

import h5py
import pytest

FIXTURES = Path(__file__).parent / "fixtures" / "hzdr-aligner"
SCRIPTS = Path(__file__).parents[1] / "scripts"
VANLIFE = "Vanlife_12.2025"


def _module(name: str):
    spec = importlib.util.spec_from_file_location(
        name.replace("-", "_"), SCRIPTS / f"{name}.py"
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def built(tmp_path_factory) -> Path:
    """Vanlife 12-03 from the fixture: built, containers written and linked."""
    root = tmp_path_factory.mktemp("package")
    index = root / "index"
    index.mkdir()
    for name in ("2025_12_03.index.json", "2025_12_03.decisions.json"):
        shutil.copy(FIXTURES / name, index)
    later = (index / "2025_12_03.decisions.json").stat().st_mtime_ns + 10**9
    os.utime(index / "2025_12_03.index.json", ns=(later, later))
    code = _module("hzdr-campaign-backfill").main([
        "--apply",
        "--index-dir", str(index),
        "--output-root", str(root / "nexus"),
        "--campaign", f"{VANLIFE}=2025_12_03",
    ])  # fmt: skip
    assert code == 0
    return root / "nexus" / VANLIFE / f"{VANLIFE}.nxs"


@pytest.fixture
def master(built: Path, tmp_path: Path) -> Path:
    """A fresh copy of the built campaign folder for each test."""
    folder = tmp_path / VANLIFE
    shutil.copytree(built.parent, folder)
    return folder / built.name


def test_the_package_describes_the_folder(master):
    package = _module("hzdr-package-campaign")
    assert package.main(["--master", str(master), "--no-validate"]) == 0
    manifest = json.loads((master.parent / "PACKAGE.json").read_text())
    assert manifest["experiment_id"] == VANLIFE
    assert manifest["shots"] == 3
    assert manifest["shots_by_source"] == {"shotsheet": 3}
    assert manifest["containers"] == 3
    assert manifest["bridge_profile"].startswith("hzdr-canonical-shot-v")
    assert [f["path"] for f in manifest["files"]] == [
        master.name,
        "shots/20251203_000001.nxs",
        "shots/20251203_000002.nxs",
        "shots/20251203_000003.nxs",
    ]
    assert "sha256" not in manifest["files"][0]  # only with --checksums
    assert manifest["validation"]["outcome"] == "not validated"
    readme = (master.parent / "README.md").read_text()
    assert "silx view" in readme
    assert "h5web or myhdf5" in readme
    assert not (master.parent / "SHA256SUMS").exists()
    # Nothing private: paths are relative to the folder.
    assert str(master.parent) not in json.dumps(manifest)


def test_a_dangling_link_is_refused(master):
    (master.parent / "shots" / "20251203_000002.nxs").unlink()
    package = _module("hzdr-package-campaign")
    assert package.main(["--master", str(master), "--no-validate"]) == 2
    assert not (master.parent / "PACKAGE.json").exists()


def test_checksums_and_the_tar_unpack_into_a_working_package(master, tmp_path):
    package = _module("hzdr-package-campaign")
    tar = tmp_path / "export" / f"{VANLIFE}.tar"
    code = package.main([
        "--master",
        str(master),
        "--no-validate",
        "--checksums",
        "--tar",
        str(tar),
    ])
    assert code == 0
    sums = (master.parent / "SHA256SUMS").read_text().splitlines()
    assert len(sums) == 4
    assert sums[0].endswith(f"  {master.name}")
    unpacked = tmp_path / "unpacked"
    with tarfile.open(tar) as archive:
        archive.extractall(unpacked, filter="data")
    copy = unpacked / VANLIFE
    assert subprocess.run(
        ["sha256sum", "-c", "--quiet", "SHA256SUMS"],  # noqa: S607
        cwd=copy, check=False,
    ).returncode == 0  # fmt: skip
    with h5py.File(copy / master.name, "r") as handle:
        # The root link lands on the container's /entry.
        container = handle["20251203_000002"]
        assert isinstance(container, h5py.Group)
        assert "experiment_identifier" in container


@pytest.mark.parametrize(
    ("code", "outcome", "exit_code"),
    [(0, "valid", 0), (1, "not valid", 1), (2, "not validated", 0)],
)
def test_ndss_verdict_is_recorded(master, code, outcome, exit_code):
    package = _module("hzdr-package-campaign")
    seen: list[list[str]] = []

    def gate(cmd):
        seen.append(list(cmd))
        (master.parent / ".validation.json").write_text(
            json.dumps({"passed": code == 0})
        )
        return code

    assert (
        package.main(["--master", str(master), "--validate-python", "nds"], gate=gate)
        == exit_code
    )
    assert seen[0][0] == "nds"
    assert seen[0][-2:] == ["--master", str(master)]
    manifest = json.loads((master.parent / "PACKAGE.json").read_text())
    assert manifest["validation"]["outcome"] == outcome
    assert manifest["validation"]["report"] == {"passed": code == 0}
    assert (
        f"Validation (NeXus Design Studio): {outcome}"
        in (master.parent / "README.md").read_text()
    )
