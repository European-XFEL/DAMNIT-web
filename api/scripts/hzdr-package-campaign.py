#!/usr/bin/env python
"""Package a built campaign on bigdata: a manifest, a README, NDS's verdict.

Plan: hzdr/docs/plans/plan-campaign-package.md (ruling R-2026-11-22i). Run
from ``api/`` as the user who owns the output (on fwkt-webapps: tippey)::

    uv run --no-sync python scripts/hzdr-package-campaign.py \\
        --master /home/tippey/mnt/bigdata/HPLexp/nexus/<c>/<c>.nxs \\
        [--checksums] [--tar /path/<c>.tar] [--validate-python <nds python>]

The campaign folder *is* the package: the master and ``shots/``, linked by
relative paths, so copying the folder is a complete export. Nothing is
copied. Beside the master this writes:

- ``PACKAGE.json``: the campaign, damnit-api version and commit, bridge
  profile; every file (the master and each container it links) with size
  and mtime, and sha256 with ``--checksums``; the validation outcome;
- ``README.md``: what is inside and how to open it (silx for the master;
  h5web or myhdf5 for one container, since they do not follow links);
- ``SHA256SUMS`` with ``--checksums`` (``sha256sum -c SHA256SUMS``).

Only ``--checksums`` and ``--tar`` read every byte (plan-quiet-builds). A
master linking a container that is not there is refused.

Validation is NDS's gate, ``hzdr-nexus-validate.py``, run with
``--validate-python`` (default: ``DW_API_HZDR_BUILDER__VALIDATION_PYTHON``).
If the gate fails, the package is still written, marked not valid, and the
script exits 1.

Exit status: 0 packaged (valid, or not validated); 1 the gate failed;
2 no master, or a dangling container link.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import subprocess
import sys
import tarfile
from collections import Counter
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import h5py

SCRIPTS = Path(__file__).resolve().parent
VALIDATOR = SCRIPTS / "hzdr-nexus-validate.py"
Gate = Callable[[Sequence[str]], int]


def _version() -> str:
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version("damnit-api")
    except PackageNotFoundError:
        return "unknown"


def _commit() -> str | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(SCRIPTS), "rev-parse", "--short=12", "HEAD"],  # noqa: S607
            capture_output=True, text=True, check=False, timeout=10,
        )  # fmt: skip
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None


def _text(value: Any) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)


def read_master(master: Path) -> dict[str, Any]:
    """The master's facts and the containers it links (relative names)."""
    with h5py.File(master, "r") as handle:
        entry = handle["entry"]
        assert isinstance(entry, h5py.Group)
        shots = entry.get("shots")
        sources: Counter[str] = Counter()
        count = 0
        if isinstance(shots, h5py.Group):
            if "experiment_id_source" in shots:
                dataset = shots["experiment_id_source"]
                assert isinstance(dataset, h5py.Dataset)
                sources.update(_text(v) for v in dataset[()])
                count = sum(sources.values())
            elif "shot_key" in shots:
                dataset = shots["shot_key"]
                assert isinstance(dataset, h5py.Dataset)
                count = len(dataset)
        links = {}
        for name in handle:
            link = handle.get(name, getlink=True)
            if isinstance(link, h5py.ExternalLink) and link.filename.startswith(
                "shots/"
            ):
                links[str(name)] = link.filename
        identifier = entry.get("experiment_identifier")
        profile = handle.attrs.get("damnit_bridge_profile", "")
        return {
            "experiment_id": _text(identifier[()])
            if isinstance(identifier, h5py.Dataset)
            else master.stem,
            "bridge_profile": _text(profile),
            "shots": count,
            "shots_by_source": dict(sorted(sources.items())),
            "containers": dict(sorted(links.items())),
        }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _file_entry(folder: Path, relative: str, checksums: bool) -> dict[str, Any]:
    path = folder / relative
    stat = path.stat()
    entry: dict[str, Any] = {
        "path": relative,
        "bytes": stat.st_size,
        "modified": datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
    }
    if checksums:
        entry["sha256"] = _sha256(path)
    return entry


def validate(
    master: Path, python: str | None, gate: Gate | None = None
) -> dict[str, Any]:
    """NDS's gate on the master and its containers; never raises."""
    if not python and gate is None:
        return {"outcome": "not validated", "reason": "no NDS Python configured"}
    run = gate or (lambda cmd: subprocess.run(list(cmd), check=False).returncode)
    code = run([python or sys.executable, str(VALIDATOR), "--master", str(master)])
    report = master.parent / ".validation.json"
    outcome = {0: "valid", 1: "not valid"}.get(code, "not validated")
    result: dict[str, Any] = {"outcome": outcome, "exit": code}
    if report.is_file():
        with contextlib.suppress(OSError, ValueError):
            result["report"] = json.loads(report.read_text(encoding="utf-8"))
    return result


README = """# {experiment_id}

A DAMNIT campaign, packaged {built} by `hzdr-package-campaign.py`
(damnit-api {version}{commit}).

**Validation (NeXus Design Studio): {validation}.**

## What is here

- `{master}`: the campaign master. `/entry/shots` has one row per shot
  ({shots} shots{sources}); `/entry/source_events` has every event (join on
  `shot_key`, never by position). Its root also holds one external link per
  shot container, named by the container's stem.
- `shots/`: {containers} shot containers, one per shot, with the detector
  data (`<YYYYMMDD>_<number>.nxs`).
- `PACKAGE.json`: every file with its size{sums}, and the validation result.
{sha_line}
Copy the whole folder: the master links the containers by relative path.

## How to open it

- **The master: `silx view {master}`.** silx follows the links and streams the
  data, so the whole campaign opens without loading it.
- **One shot: h5web or myhdf5** (in the browser) **on one file in `shots/`.**
  They read one file whole and do not follow links: the master alone shows
  an empty tree of links there.
- In Python: `h5py.File("{master}")["<stem>/..."]` follows a link into its
  container.
"""


def write_package(
    master: Path,
    *,
    checksums: bool = False,
    validation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Write PACKAGE.json, README.md and (with checksums) SHA256SUMS."""
    folder = master.parent
    facts = read_master(master)
    missing = sorted(
        relative
        for relative in facts["containers"].values()
        if not (folder / relative).is_file()
    )
    if missing:
        message = (
            f"{len(missing)} linked container(s) missing: {', '.join(missing[:5])}"
        )
        raise FileNotFoundError(message)
    files = [_file_entry(folder, master.name, checksums)] + [
        _file_entry(folder, relative, checksums)
        for relative in sorted(set(facts["containers"].values()))
    ]
    commit = _commit()
    manifest = {
        "package": "damnit-campaign-v1",
        "experiment_id": facts["experiment_id"],
        "packaged_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "damnit_api": _version(),
        "commit": commit,
        "bridge_profile": facts["bridge_profile"],
        "master": master.name,
        "shots": facts["shots"],
        "shots_by_source": facts["shots_by_source"],
        "containers": len(files) - 1,
        "bytes": sum(f["bytes"] for f in files),
        "validation": validation or {"outcome": "not validated"},
        "files": files,
    }
    (folder / "PACKAGE.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if checksums:
        (folder / "SHA256SUMS").write_text(
            "".join(f"{f['sha256']}  {f['path']}\n" for f in files)
        )
    sources = ", ".join(f"{n} from {s}" for s, n in facts["shots_by_source"].items())
    (folder / "README.md").write_text(
        README.format(
            experiment_id=facts["experiment_id"],
            built=manifest["packaged_at"][:10],
            version=manifest["damnit_api"],
            commit=f", {commit}" if commit else "",
            validation=manifest["validation"]["outcome"],
            master=master.name,
            shots=facts["shots"],
            sources=f": {sources}" if sources else "",
            containers=manifest["containers"],
            sums=" and sha256" if checksums else "",
            sha_line="- `SHA256SUMS`: check with `sha256sum -c SHA256SUMS`.\n"
            if checksums
            else "",
        )
    )
    return manifest


def write_tar(master: Path, manifest: dict[str, Any], target: Path) -> Path:
    """One uncompressed tar of the package under ``<campaign folder name>/``."""
    folder = master.parent
    names = [f["path"] for f in manifest["files"]] + [
        name for name in ("PACKAGE.json", "README.md", "SHA256SUMS")
        if (folder / name).is_file()
    ]  # fmt: skip
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(f"{target.name}.partial")
    with tarfile.open(partial, "w") as archive:
        for name in names:
            archive.add(folder / name, arcname=f"{folder.name}/{name}")
    partial.replace(target)
    return target


def _settings_python() -> str | None:
    try:
        from damnit_api.shared.settings import settings
    except Exception:
        return None
    return settings.hzdr_builder.validation_python or None


def main(argv: list[str] | None = None, *, gate: Gate | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(__doc__ or "").split("\n\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--master", type=Path, required=True)
    parser.add_argument("--checksums", action="store_true", help="sha256 every file")
    parser.add_argument("--tar", type=Path, help="also write one tar here")
    parser.add_argument(
        "--validate-python",
        help="NDS's Python (default: DW_API_HZDR_BUILDER__VALIDATION_PYTHON)",
    )
    parser.add_argument("--no-validate", action="store_true", help="skip NDS's gate")
    args = parser.parse_args(argv)

    master = args.master.resolve()
    if not master.is_file():
        print(f"No master at {master}", file=sys.stderr)
        return 2
    validation = (
        {"outcome": "not validated", "reason": "--no-validate"}
        if args.no_validate
        else validate(master, args.validate_python or _settings_python(), gate)
    )
    try:
        manifest = write_package(
            master, checksums=args.checksums, validation=validation
        )
    except FileNotFoundError as error:
        print(f"Not packaged: {error}", file=sys.stderr)
        return 2
    print(
        f"Packaged {manifest['experiment_id']}: {manifest['shots']} shots, "
        f"{manifest['containers']} containers, {manifest['bytes'] / 1e6:.1f} MB; "
        f"validation: {manifest['validation']['outcome']}; "
        f"{master.parent / 'PACKAGE.json'}"
    )
    if args.tar:
        print(f"Archive: {write_tar(master, manifest, args.tar.resolve())}")
    return 1 if manifest["validation"]["outcome"] == "not valid" else 0


if __name__ == "__main__":
    sys.exit(main())
