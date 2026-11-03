#!/usr/bin/env python3
"""Refresh the contributor test coverage map from pytest-cov JSON output.

The shape the sibling repositories share, so `fwkt-webapps` can transcribe
every component's map onto its project page without anyone retyping a figure
that then rots. Rendered between the markers in ``CONTRIBUTING.md``, and
nothing else writes those numbers.

    cd api
    uv run --group test pytest -q --cov=damnit_api \\
        --cov-report=json:../cover/coverage.json
    cd ..
    uv run --group test python scripts/docs/refresh_coverage_map.py

Distinct from ``hzdr/docs/status/testing.md``, which the separate
``hzdr/scripts/docs/refresh_coverage_summary.py`` fills with one row *per
constellation repository*. That answers "how well tested is the constellation";
this answers "which parts of this API are tested", and only this one is what the
hub transcribes.

The suite runs from ``api/``, so coverage records paths like
``src/damnit_api/...``. They are normalised to repository-relative
``api/src/damnit_api/...`` here, which is what ``AREAS`` and the drift guard in
``api/tests/test_coverage_docs.py`` both use.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = "damnit_api"
DEFAULT_COVERAGE_JSON = ROOT / "cover" / "coverage.json"
DEFAULT_DOC = ROOT / "CONTRIBUTING.md"
START_MARKER = "<!-- test-coverage-map-start -->"
END_MARKER = "<!-- test-coverage-map-end -->"

A = "api/src/damnit_api"
T = "api/tests"


@dataclass(frozen=True)
class CoverageArea:
    name: str
    files: tuple[str, ...]
    tests: tuple[str, ...]
    watch_next: str


UNMAPPED_SOURCE_FILES: frozenset[str] = frozenset()

UNMAPPED_TEST_MODULES: frozenset[str] = frozenset({
    # Checks the coverage tooling itself, not a feature area.
    f"{T}/test_coverage_docs.py",
})

AREAS = (
    CoverageArea(
        name="HZDR metadata, NeXus and openPMD",
        files=(
            f"{A}/metadata/__init__.py",
            f"{A}/metadata/hzdr_event.py",
            f"{A}/metadata/hzdr_nexus.py",
            f"{A}/metadata/hzdr_openpmd.py",
            f"{A}/shared/hzdr_paths.py",
            f"{A}/metadata/hzdr_sources.py",
            f"{A}/metadata/labfrog_sqlite.py",
            f"{A}/metadata/models.py",
            f"{A}/metadata/producer_status.py",
            f"{A}/metadata/scicat.py",
        ),
        tests=(
            f"{T}/test_hzdr_nexus.py",
            f"{T}/test_hzdr_nexus_sample.py",
            f"{T}/test_hzdr_openpmd_preflight.py",
            f"{T}/test_hzdr_event.py",
            f"{T}/test_hzdr_sources.py",
            f"{T}/test_hzdr_path_map.py",
            f"{T}/test_hzdr_reference_fixture.py",
            f"{T}/test_hzdr_labfrog_sqlite.py",
            f"{T}/test_hzdr_producer_status.py",
            f"{T}/test_hzdr_scicat.py",
            f"{T}/test_hzdr_semantic_golden_fixture.py",
            f"{T}/test_metadata_keys.py",
            f"{T}/test_hzdr_simulation_link.py",
            f"{T}/test_hzdr_catalog_publisher.py",
            f"{T}/test_hzdr_package_emulator.py",
            f"{T}/test_hzdr_integration.py",
            f"{T}/test_hzdr_campaign_resolution.py",
            f"{T}/test_match_rank_docs.py",
        ),
        watch_next=(
            "Real SciCat and PID reconciliation, which the offline suite can only "
            "emulate"
        ),
    ),
    CoverageArea(
        name="HZDR diagnostic packs and shot containers",
        files=(
            f"{A}/metadata/hzdr_compare.py",
            f"{A}/metadata/hzdr_containers.py",
            f"{A}/metadata/hzdr_packs/mapping_rows.py",
            f"{A}/metadata/hzdr_packs/__init__.py",
            f"{A}/metadata/hzdr_packs/_h5.py",
            f"{A}/metadata/hzdr_packs/_images.py",
            f"{A}/metadata/hzdr_packs/camera_png_csv.py",
            f"{A}/metadata/hzdr_packs/sequence_frames.py",
            f"{A}/metadata/hzdr_packs/spectrometer_irr8.py",
            f"{A}/metadata/hzdr_packs/vendor/__init__.py",
            f"{A}/metadata/hzdr_packs/vendor/camera_metadata.py",
            f"{A}/metadata/hzdr_packs/vendor/img_csv.py",
            f"{A}/metadata/hzdr_packs/vendor/irr8.py",
            f"{A}/metadata/hzdr_packs/vendor/nxwrite.py",
        ),
        tests=(
            f"{T}/test_hzdr_compare.py",
            f"{T}/test_hzdr_containers.py",
            f"{T}/test_hzdr_mapping_rows.py",
            f"{T}/test_hzdr_nexus_validate.py",
            f"{T}/test_hzdr_packs.py",
            f"{T}/test_hzdr_pack_readers.py",
            f"{T}/test_hzdr_packs_sync.py",
        ),
        watch_next=(
            "The vendored files' cv2/nexusformat paths (shot-aligner's, unused "
            "here), frame formats the December campaign did not write, and the "
            "container worker against a real campaign on the bigdata mount"
        ),
    ),
    CoverageArea(
        name="HZDR routers and services",
        files=(
            f"{A}/metadata/gql.py",
            f"{A}/metadata/hzdr_routers.py",
            f"{A}/metadata/routers.py",
            f"{A}/metadata/services.py",
        ),
        tests=(
            f"{T}/test_hzdr_review.py",
            f"{T}/test_hzdr_saved_views.py",
            f"{T}/test_hzdr_wiki.py",
            f"{T}/test_hzdr_screenshot_capture.py",
        ),
        watch_next=(
            "`services.py` at 16%: the long-running service wiring is exercised only "
            "on a deployment"
        ),
    ),
    CoverageArea(
        name="Event ingestion (Kafka, ASAPO, spool)",
        files=(
            f"{A}/consumer/__init__.py",
            f"{A}/consumer/asapo.py",
            f"{A}/consumer/bootstrap.py",
            f"{A}/consumer/builder_trigger.py",
            f"{A}/consumer/campaign_builds.py",
            f"{A}/consumer/kafka.py",
            f"{A}/consumer/spool.py",
        ),
        tests=(
            f"{T}/test_hzdr_asapo_externalization.py",
            f"{T}/test_hzdr_broker_roundtrip.py",
            f"{T}/test_hzdr_builder_trigger.py",
            f"{T}/test_hzdr_consumer_bootstrap.py",
            f"{T}/test_hzdr_kafka_spool.py",
            f"{T}/test_hzdr_multi_campaign.py",
            f"{T}/test_hzdr_spool.py",
        ),
        watch_next=(
            "A live broker: everything here runs against an in-process or emulated one"
        ),
    ),
    CoverageArea(
        name="GraphQL and data access",
        files=(
            f"{A}/graphql/__init__.py",
            f"{A}/graphql/directives.py",
            f"{A}/graphql/metadata.py",
            f"{A}/graphql/queries.py",
            f"{A}/graphql/subscriptions.py",
            f"{A}/graphql/utils.py",
            f"{A}/runs/__init__.py",
            f"{A}/runs/preview.py",
            f"{A}/runs/serialization.py",
            f"{A}/runs/types.py",
        ),
        tests=(f"{T}/test_data.py",),
        watch_next=(
            "Subscription lifecycles under a real client, and the schema directives"
        ),
    ),
    CoverageArea(
        name="Context file",
        files=(
            f"{A}/contextfile/__init__.py",
            f"{A}/contextfile/models.py",
            f"{A}/contextfile/routers.py",
        ),
        tests=(f"{T}/test_contextfile.py",),
        watch_next="Variable evaluation against a real DAMNIT context file on disk",
    ),
    CoverageArea(
        name="Authentication and directory",
        files=(
            f"{A}/auth/__init__.py",
            f"{A}/auth/bootstrap.py",
            f"{A}/auth/dependencies.py",
            f"{A}/auth/gql.py",
            f"{A}/auth/ldap.py",
            f"{A}/auth/models.py",
            f"{A}/auth/permissions.py",
            f"{A}/auth/routers.py",
        ),
        tests=(f"{T}/test_auth_modes.py",),
        watch_next=(
            "A real LDAP bind and the OAuth routers, neither reachable from the "
            "offline suite"
        ),
    ),
    CoverageArea(
        name="App core, database and settings",
        files=(
            f"{A}/__init__.py",
            f"{A}/_logging.py",
            f"{A}/main.py",
            f"{A}/runs/sqlite/__init__.py",
            f"{A}/runs/sqlite/repository.py",
            f"{A}/runs/sqlite/session.py",
            f"{A}/utils.py",
            f"{A}/_db/__init__.py",
            f"{A}/_db/bootstrap.py",
            f"{A}/_db/dependencies.py",
            f"{A}/_db/models.py",
            f"{A}/shared/__init__.py",
            f"{A}/shared/const.py",
            f"{A}/shared/errors.py",
            f"{A}/shared/flow_activity.py",
            f"{A}/shared/gql.py",
            f"{A}/shared/hzdr_settings.py",
            f"{A}/shared/models.py",
            f"{A}/shared/routers.py",
            f"{A}/shared/settings.py",
        ),
        tests=(
            f"{T}/test_db.py",
            f"{T}/test_errors.py",
            f"{T}/test_hzdr_config.py",
            f"{T}/test_runtime_config.py",
            f"{T}/test_hzdr_flow_activity.py",
            f"{T}/test_logging_masks.py",
        ),
        watch_next=(
            "Application startup against a real database, and the ASGI entry point"
        ),
    ),
    CoverageArea(
        name="MyMDC integration (vendored upstream)",
        files=(
            f"{A}/_mymdc/__init__.py",
            f"{A}/_mymdc/bootstrap.py",
            f"{A}/_mymdc/clients.py",
            f"{A}/_mymdc/dependencies.py",
            f"{A}/_mymdc/models.py",
            f"{A}/_mymdc/ports.py",
            f"{A}/_mymdc/settings.py",
            f"{A}/_mymdc/vendor/__init__.py",
            f"{A}/_mymdc/vendor/models.py",
        ),
        tests=(),
        watch_next=(
            "Upstream European XFEL code this deployment does not use; revendor rather "
            "than test around it"
        ),
    ),
)


def _coverage_files(payload: dict) -> dict[str, dict]:
    """Coverage keys, normalised to repository-relative paths.

    pytest runs from ``api/``, so the JSON holds ``src/damnit_api/...``.
    """
    out: dict[str, dict] = {}
    for path, details in payload.get("files", {}).items():
        if not isinstance(details, dict):
            continue
        clean = path.replace("\\", "/")
        if not clean.startswith("api/"):
            clean = f"api/{clean}"
        out[clean] = details
    return out


def _area_percent(area: CoverageArea, files: dict[str, dict]) -> int | None:
    covered = statements = 0
    for path in area.files:
        summary = files.get(path, {}).get("summary", {})
        covered += int(summary.get("covered_lines", 0))
        statements += int(summary.get("num_statements", 0))
    if not statements:
        return None
    return round((covered / statements) * 100)


def _coverage_label(percent: int | None) -> str:
    if percent is None:
        return "No data"
    if percent >= 85:
        return "Strong"
    if percent >= 70:
        return "Good"
    if percent >= 55:
        return "Moderate"
    return "Needs attention"


def _coverage_cell(percent: int | None) -> str:
    if percent is None:
        return "No coverage data"
    return (
        f'<progress value="{percent}" max="100">{percent}%</progress> '
        f"{_coverage_label(percent)}"
    )


def _format_paths(paths: tuple[str, ...]) -> str:
    if not paths:
        return "_no dedicated suite_"
    return ", ".join(f"`{path}`" for path in paths)


def build_coverage_map(payload: dict) -> str:
    files = _coverage_files(payload)
    rows = [
        "| "
        + " | ".join((
            area.name,
            _coverage_cell(_area_percent(area, files)),
            _format_paths(area.tests),
            area.watch_next,
        ))
        + " |"
        for area in AREAS
    ]

    totals = payload.get("totals", {})
    total_percent = totals.get("percent_covered_display")
    if total_percent is None:
        total_percent = totals.get("percent_covered")
    total_text = f"{float(total_percent):.2f}%" if total_percent is not None else "n/a"

    return "\n".join((
        (
            "Use this generated map as a quick sense of which parts of the API are "
            "well covered before"
        ),
        (
            "changing a reconciler, a router, or the NeXus builder. Percentages come "
            "from the latest"
        ),
        "pytest-cov JSON run over `damnit_api`; the frontend is not measured here.",
        "",
        f"Overall `{PACKAGE}` line coverage from that run: **{total_text}**.",
        "",
        "| Area | Coverage | Main tests | Watch next |",
        "| --- | --- | --- | --- |",
        *rows,
    ))


def replace_marked_block(text: str, replacement: str) -> str:
    start = text.index(START_MARKER) + len(START_MARKER)
    end = text.index(END_MARKER)
    return f"{text[:start]}\n\n{replacement}\n\n{text[end:]}"


def refresh_document(
    coverage_json: Path = DEFAULT_COVERAGE_JSON,
    document: Path = DEFAULT_DOC,
    *,
    check_only: bool = False,
) -> bool:
    payload = json.loads(coverage_json.read_text(encoding="utf-8"))
    current = document.read_text(encoding="utf-8")
    updated = replace_marked_block(current, build_coverage_map(payload))
    changed = updated != current
    if changed and not check_only:
        document.write_text(updated, encoding="utf-8")
    return changed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "coverage_json",
        nargs="?",
        type=Path,
        default=DEFAULT_COVERAGE_JSON,
        help="pytest-cov JSON output to read.",
    )
    parser.add_argument(
        "--document",
        type=Path,
        default=DEFAULT_DOC,
        help="Markdown file containing the coverage-map markers.",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Fail if the generated coverage map is not committed.",
    )
    args = parser.parse_args(argv)

    if not args.coverage_json.exists():
        print(f"Coverage JSON not found: {args.coverage_json}", file=sys.stderr)
        print(
            "Run: cd api && uv run --group test pytest -q --cov=damnit_api "
            "--cov-report=json:../cover/coverage.json",
            file=sys.stderr,
        )
        return 2

    changed = refresh_document(
        args.coverage_json, args.document, check_only=args.check_only
    )
    if args.check_only and changed:
        print(f"Coverage map is stale in {args.document}", file=sys.stderr)
        return 1
    print(
        f"{'Refreshed' if changed else 'Already up to date:'} coverage map in "
        f"{args.document}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
