"""Compare DAMNIT's shot containers with shot-aligner's (campaign output phase 6).

    uv run python api/scripts/hzdr-compare-containers.py \\
        --damnit <campaign folder | shots/ | one .nxs> \\
        --aligner <shot-aligner build folder | one .h5> \\
        [--pairs pairs.csv] [--tolerance 2] [--json report.json] [--allow-unpaired]

Phase 6 builds one real campaign both ways and requires the diff to be empty
apart from the documented differences. This prints that diff.

Two files are compared as they are. Two folders are paired first: each
container's ``/entry/start_time``, the nearest within ``--tolerance`` seconds
(DAMNIT writes the trigger's ``fired_at``, shot-aligner its anchor's clock), or
``--pairs``, a CSV of ``damnit,aligner`` paths relative to the two folders, when
the clocks disagree by more. A container with no partner is reported; it fails
the comparison unless ``--allow-unpaired`` (a campaign built only partly on one
side).

Each pair's nodes are *same*, *ignored* (every rule says why:
``damnit_api.metadata.hzdr_compare.IGNORED``) or *different*. Exit 0: every
pair equal (and nothing unpaired). Exit 1: a difference. Exit 2: an input is
not there, or no container was found.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import TYPE_CHECKING

import h5py

from damnit_api.metadata.hzdr_compare import (
    CAMPAIGN_TIMEZONE,
    Comparison,
    compare,
    instant,
    text,
)

if TYPE_CHECKING:
    from datetime import datetime

CANNOT_RUN = 2
DAMNIT_CONTAINER = re.compile(r"^(?:\d{8}|unknown)_\d{6,}\.nxs$")
SHOWN = 20  # differences printed per pair; the JSON report has them all


def _damnit_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    shots = path / "shots" if (path / "shots").is_dir() else path
    return sorted(p for p in shots.iterdir() if DAMNIT_CONTAINER.match(p.name))


def _aligner_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    return sorted(p for p in path.rglob("*.h5") if p.is_file())


def _start_time(path: Path, zone: str = CAMPAIGN_TIMEZONE) -> datetime | None:
    """The container's ``start_time``; one without an offset is read in ``zone``."""
    try:
        with h5py.File(path, "r") as handle:
            value = handle.get("entry/start_time")
            raw = text(value[()]) if isinstance(value, h5py.Dataset) else None
        return instant(raw, zone) if raw else None
    except (OSError, ValueError, TypeError):
        return None


def pair_by_time(
    damnit: list[Path],
    aligner: list[Path],
    tolerance: float,
    zone: str = CAMPAIGN_TIMEZONE,
) -> tuple[list[tuple[Path, Path]], list[Path], list[Path]]:
    """Each DAMNIT container with the nearest shot-aligner one in time.

    Closest pairs first, each container used once, so two shots a second apart
    do not both claim the same partner. A container without a readable,
    zone-aware ``start_time`` stays unpaired.
    """
    ours = {p: _start_time(p, zone) for p in damnit}
    theirs = {p: _start_time(p, zone) for p in aligner}
    candidates = []
    for a, when_a in ours.items():
        for b, when_b in theirs.items():
            if when_a is None or when_b is None:
                continue
            if (when_a.tzinfo is None) != (when_b.tzinfo is None):
                continue
            gap = abs((when_a - when_b).total_seconds())
            if gap <= tolerance:
                candidates.append((gap, str(a), str(b), a, b))
    pairs, used_a, used_b = [], set(), set()
    for _gap, _sa, _sb, a, b in sorted(candidates):
        if a in used_a or b in used_b:
            continue
        pairs.append((a, b))
        used_a.add(a)
        used_b.add(b)
    unpaired_a = [p for p in damnit if p not in used_a]
    unpaired_b = [p for p in aligner if p not in used_b]
    return sorted(pairs), unpaired_a, unpaired_b


def pair_from_csv(
    csv_path: Path, damnit_root: Path, aligner_root: Path
) -> list[tuple[Path, Path]]:
    with csv_path.open(newline="", encoding="utf-8") as stream:
        rows = [row for row in csv.reader(stream) if row and not row[0].startswith("#")]
    if rows and rows[0][:2] == ["damnit", "aligner"]:
        rows = rows[1:]
    return [(damnit_root / a.strip(), aligner_root / b.strip()) for a, b, *_ in rows]


def _report(comparison: Comparison) -> dict:
    return {
        "equal": comparison.equal,
        "same": len(comparison.same),
        "ignored": dict(Counter(comparison.ignored.values())),
        "only_damnit": comparison.only_damnit,
        "only_aligner": comparison.only_aligner,
        "different": {
            path: {key: list(values) for key, values in delta.items()}
            for path, delta in comparison.different.items()
        },
    }


def _print_pair(damnit: Path, aligner: Path, comparison: Comparison) -> None:
    state = "equal" if comparison.equal else "DIFFERENT"
    print(
        f"{damnit.name} ~ {aligner.name}: {state}; {len(comparison.same)} same, "
        f"{len(comparison.ignored)} ignored, {len(comparison.different)} different, "
        f"{len(comparison.only_damnit)} only in DAMNIT, "
        f"{len(comparison.only_aligner)} only in shot-aligner"
    )
    lines = [f"  only in DAMNIT: {p}" for p in comparison.only_damnit]
    lines += [f"  only in shot-aligner: {p}" for p in comparison.only_aligner]
    for path, delta in comparison.different.items():
        for key, (ours, theirs) in delta.items():
            lines.append(f"  {path} [{key}]: DAMNIT {ours!r} / shot-aligner {theirs!r}")
    for line in lines[:SHOWN]:
        print(line[:400])
    if len(lines) > SHOWN:
        print(f"  ... {len(lines) - SHOWN} more (see --json)")


def _pairs(args) -> tuple[list[tuple[Path, Path]], list[Path], list[Path]] | None:
    """What to compare: the CSV's pairs, the two files, or folders by time."""
    if args.pairs:
        return pair_from_csv(args.pairs, args.damnit, args.aligner), [], []
    if args.damnit.is_file() and args.aligner.is_file():
        return [(args.damnit, args.aligner)], [], []
    damnit, aligner = _damnit_files(args.damnit), _aligner_files(args.aligner)
    if not damnit or not aligner:
        print(
            f"Comparison could not run: {len(damnit)} DAMNIT and {len(aligner)} "
            "shot-aligner container(s) found",
            file=sys.stderr,
        )
        return None
    return pair_by_time(damnit, aligner, args.tolerance, args.timezone)


def _compare_all(pairs, tolerance: float, zone: str = CAMPAIGN_TIMEZONE) -> list[dict]:
    results = []
    for ours, theirs in pairs:
        try:
            comparison = compare(ours, theirs, tolerance=tolerance, zone=zone)
        except OSError as error:
            print(f"{ours.name} ~ {theirs.name}: could not be read ({error})")
            results.append({
                "damnit": str(ours),
                "aligner": str(theirs),
                "equal": False,
                "error": str(error),
            })
            continue
        _print_pair(ours, theirs, comparison)
        results.append({
            "damnit": str(ours),
            "aligner": str(theirs),
            **_report(comparison),
        })
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--damnit", type=Path, required=True)
    parser.add_argument("--aligner", type=Path, required=True)
    parser.add_argument("--pairs", type=Path, help="CSV of damnit,aligner paths")
    parser.add_argument("--tolerance", type=float, default=2.0, help="seconds")
    parser.add_argument(
        "--timezone",
        default=CAMPAIGN_TIMEZONE,
        help="zone of a start_time written without an offset (older shot-aligner)",
    )
    parser.add_argument("--json", type=Path, help="write the full report here")
    parser.add_argument("--allow-unpaired", action="store_true")
    args = parser.parse_args(argv)

    for given in (args.damnit, args.aligner, args.pairs):
        if given is not None and not given.exists():
            print(f"Comparison could not run: {given} is not there", file=sys.stderr)
            return CANNOT_RUN
    found = _pairs(args)
    if found is None:
        return CANNOT_RUN
    pairs, unpaired_a, unpaired_b = found

    results = _compare_all(pairs, args.tolerance, args.timezone)
    for path in unpaired_a:
        print(f"{path.name}: no shot-aligner container within {args.tolerance} s")
    for path in unpaired_b:
        print(f"{path.name}: no DAMNIT container within {args.tolerance} s")
    equal = sum(bool(r.get("equal")) for r in results)
    unpaired = bool(unpaired_a or unpaired_b)
    passed = equal == len(results) and (args.allow_unpaired or not unpaired)
    print(
        f"Compared {len(results)} pair(s): {equal} equal, {len(results) - equal} "
        f"different; unpaired: {len(unpaired_a)} DAMNIT, {len(unpaired_b)} shot-aligner"
    )
    if args.json:
        report = {
            "pairs": results,
            "unpaired_damnit": [str(p) for p in unpaired_a],
            "unpaired_aligner": [str(p) for p in unpaired_b],
            "tolerance_s": args.tolerance,
            "passed": passed,
        }
        args.json.write_text(json.dumps(report, indent=2, sort_keys=True), "utf-8")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
