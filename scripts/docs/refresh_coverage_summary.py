#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Helmholtz-Zentrum Dresden-Rossendorf e.V (HZDR)
# SPDX-License-Identifier: Apache-2.0

"""Refresh the aggregate cross-repo test coverage map in ``docs/status/testing.md``.

``scripts/test-all.ps1`` runs every HZDR suite with pytest-cov and writes a
``cover/coverage.json`` into each repo. This script reads the overall line
coverage from each of those JSON files and renders one row per repo between the
markers in ``docs/status/testing.md``.

Each sibling repo also keeps its own per-area coverage map (refreshed by its own
``poe test-fast`` / ``scripts/docs/refresh_coverage_map.py``); this is the
combined HZDR view that lives with the cross-repo "Verified" table.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GITLAB_ROOT = ROOT.parent
DEFAULT_DOC = ROOT / "docs" / "status" / "testing.md"
START_MARKER = "<!-- coverage-summary-start -->"
END_MARKER = "<!-- coverage-summary-end -->"


@dataclass(frozen=True)
class RepoCoverage:
    label: str
    package: str
    suite: str
    # Path to the pytest-cov JSON, relative to the GitLab root that holds all
    # sibling checkouts.
    coverage_json: str


REPOS = (
    RepoCoverage(
        label="DAMNIT API",
        package="damnit_api",
        suite="`api/tests`",
        coverage_json="DAMNIT-web-hzdr/api/cover/coverage.json",
    ),
    RepoCoverage(
        label="LabFrog",
        package="labfrog",
        suite="`tests` (non-webkit)",
        coverage_json="labfrog/cover/coverage.json",
    ),
    RepoCoverage(
        label="LabFrog SQLite tools",
        package="labfrog_sqlite_tools",
        suite="`tests`",
        coverage_json="labfrog-sqlite-tools-repo/cover/coverage.json",
    ),
    RepoCoverage(
        label="DAQ File Watchdog",
        package="watchdog_core",
        suite="`tests`",
        coverage_json="planet-watchdog/cover/coverage.json",
    ),
    RepoCoverage(
        label="shotcounter",
        package="hzdrTangoDSShotcounter",
        suite="`tests` (non-ntp)",
        coverage_json="shotcounter/cover/coverage.json",
    ),
    RepoCoverage(
        label="ASAPO harness",
        package="tools",
        suite="`tests`",
        coverage_json="asapo-for-hzdr-damnit/cover/coverage.json",
    ),
)


def _read_total_percent(coverage_json: Path) -> float | None:
    if not coverage_json.exists():
        return None
    try:
        payload = json.loads(coverage_json.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    totals = payload.get("totals", {})
    percent = totals.get("percent_covered_display")
    if percent is None:
        percent = totals.get("percent_covered")
    if percent is None:
        return None
    try:
        return float(percent)
    except (TypeError, ValueError):
        return None


def _coverage_label(percent: float | None) -> str:
    if percent is None:
        return "No data"
    if percent >= 85:
        return "Strong"
    if percent >= 70:
        return "Good"
    if percent >= 55:
        return "Moderate"
    return "Needs attention"


def _coverage_cell(percent: float | None) -> str:
    if percent is None:
        return "No coverage data"
    value = round(percent)
    label = _coverage_label(percent)
    return f'<progress value="{value}" max="100">{value}%</progress> {percent:.0f}% {label}'


def build_summary() -> str:
    rows = []
    for repo in REPOS:
        percent = _read_total_percent(GITLAB_ROOT / repo.coverage_json)
        rows.append(
            "| "
            + " | ".join(
                (
                    repo.label,
                    _coverage_cell(percent),
                    f"`{repo.package}`",
                    repo.suite,
                )
            )
            + " |"
        )
    return "\n".join(
        (
            "Overall line coverage per repo, from the latest `scripts/test-all.ps1` run.",
            "Each suite writes a `cover/coverage.json`; rows show `No coverage data` until",
            "that repo has been run with coverage. Per-area detail lives in each repo's own",
            "coverage map (`CONTRIBUTING.md` / `docs/CONTRIBUTING.md`).",
            "",
            "| Repo | Coverage | Package | Suite |",
            "| --- | --- | --- | --- |",
            *rows,
        )
    )


def replace_marked_block(text: str, replacement: str) -> str:
    start = text.index(START_MARKER) + len(START_MARKER)
    end = text.index(END_MARKER)
    return f"{text[:start]}\n\n{replacement}\n\n{text[end:]}"


def refresh_document(document: Path = DEFAULT_DOC, *, check_only: bool = False) -> bool:
    replacement = build_summary()
    current = document.read_text(encoding="utf-8")
    updated = replace_marked_block(current, replacement)
    changed = updated != current
    if changed and not check_only:
        document.write_text(updated, encoding="utf-8")
    return changed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--document",
        type=Path,
        default=DEFAULT_DOC,
        help="Markdown file containing the coverage-summary markers.",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Fail if the generated summary is not committed.",
    )
    args = parser.parse_args(argv)

    changed = refresh_document(args.document, check_only=args.check_only)
    if args.check_only and changed:
        print(f"Coverage summary is stale in {args.document}", file=sys.stderr)
        return 1
    if changed:
        print(f"Refreshed coverage summary in {args.document}")
    else:
        print(f"Coverage summary already up to date in {args.document}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
