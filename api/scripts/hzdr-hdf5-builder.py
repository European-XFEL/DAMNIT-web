"""Build the canonical HZDR NeXus bridge consumed by DAMNIT-web."""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

os.environ.setdefault("DW_API_DAMNIT_PATH", str(Path.cwd()))

from damnit_api.consumer.campaign_builds import (
    CATALOG_FILENAME,
    UNASSIGNED_SOURCE_TITLE,
    CampaignInputs,
    SpoolRoot,
    campaign_labfrog_export,
    campaign_output_nexus,
    campaigns_for_unassigned,
    discover_spool_campaigns,
    foreign_experiment_ids,
    stamp_campaign,
    unassigned_spool_files,
)
from damnit_api.metadata.hzdr_event import UNASSIGNED_EXPERIMENT_ID
from damnit_api.metadata.hzdr_nexus import (
    discover_labfrog_data_products,
    load_campaign_schedule,
    load_experiment_rulings,
    load_normalized_events,
    merge_labfrog_shots,
    normalize_labfrog_mongo_shots,
    normalize_processed_trigger_message,
    normalize_watchdog_document,
    read_labfrog_nexus_shots,
    read_labfrog_sqlite_shots,
    reconcile_canonical_shots,
    review_sidecar_path,
    single_writer_lock,
    write_nexus_bridge,
    write_sources_catalog,
)
from damnit_api.shared.hzdr_paths import missing_mount


def load_mongo_shots(args: argparse.Namespace) -> list[dict[str, Any]]:
    """Load optional live LabFrog shot documents for reconciliation."""
    if not args.mongo_uri:
        return []
    if not args.mongo_database or not args.mongo_collection:
        message = (
            "--mongo-database and --mongo-collection are required with --mongo-uri"
        )
        raise ValueError(message)

    from pymongo import MongoClient

    query = json.loads(args.mongo_query_json) if args.mongo_query_json else {}
    client = MongoClient(args.mongo_uri, serverSelectionTimeoutMS=5000)
    try:
        records = client[args.mongo_database][args.mongo_collection].find(query)
        return normalize_labfrog_mongo_shots(records)
    finally:
        client.close()


def load_json_records(paths: list[Path]) -> list[dict[str, Any]]:
    """Load raw adapter inputs from JSON or JSONL files."""
    records: list[dict[str, Any]] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        if path.suffix.lower() == ".jsonl":
            records.extend(
                json.loads(line) for line in text.splitlines() if line.strip()
            )
        else:
            records.append(json.loads(text))
    return records


def select_experiment_id(
    explicit: str | None,
    events: list[dict[str, Any]],
    labfrog_shots: list[dict[str, Any]],
    source_nexus: Path | None,
) -> str:
    """Choose one experiment boundary and reject mixed event batches.

    ``unassigned`` events (decision D1) do not name a boundary: they are routed
    by the resolution stage, so they neither count as a second campaign nor
    choose one. Only when nothing else names a campaign does the build become
    the ``unassigned`` bucket.
    """
    if explicit:
        return explicit
    all_event_ids = {str(event["experiment_id"]) for event in events}
    event_ids = all_event_ids - {UNASSIGNED_EXPERIMENT_ID}
    if len(event_ids) == 1:
        return event_ids.pop()
    if len(event_ids) > 1:
        message = "Provide --experiment-id for mixed events: " + ", ".join(
            sorted(event_ids)
        )
        raise ValueError(message)
    labfrog_experiment_ids = {
        str(
            shot.get("experiment_id")
            or (
                shot.get("metadata", {}).get("experiment_id")
                if isinstance(shot.get("metadata"), dict)
                else None
            )
        )
        for shot in labfrog_shots
        if (
            shot.get("experiment_id")
            or (
                shot.get("metadata", {}).get("experiment_id")
                if isinstance(shot.get("metadata"), dict)
                else None
            )
        )
        not in (None, "")
    }
    if len(labfrog_experiment_ids) == 1:
        return labfrog_experiment_ids.pop()
    if len(labfrog_experiment_ids) > 1:
        message = "Provide --experiment-id for mixed LabFrog exports: " + ", ".join(
            sorted(labfrog_experiment_ids)
        )
        raise ValueError(message)
    campaigns = {
        str(shot["campaign"])
        for shot in labfrog_shots
        if shot.get("campaign") not in (None, "")
    }
    if len(campaigns) == 1:
        return campaigns.pop()
    if source_nexus is not None:
        return source_nexus.stem
    if UNASSIGNED_EXPERIMENT_ID in all_event_ids:
        return UNASSIGNED_EXPERIMENT_ID
    message = "Could not infer experiment_id; provide --experiment-id"
    raise ValueError(message)


def build(
    args: argparse.Namespace,
    *,
    labfrog_shots: list[dict[str, Any]] | None = None,
    resolution_labfrog_shots: list[dict[str, Any]] | None = None,
    experiment_rulings: dict[int, str] | None = None,
    merge_catalog: bool = False,
    catalog_title: str | None = None,
    register_scicat: bool = True,
) -> tuple[Path, Path]:
    """Run one reconciliation and NeXus bridge build.

    The keyword arguments are for ``build_all``: records and rulings it has
    already loaded once for every campaign of the run, and the shared-catalog
    merge. Called with ``args`` alone, it is the single-campaign build.
    """
    event_paths = [*(args.events_jsonl or []), *(args.event_json or [])]
    events = load_normalized_events(event_paths)
    if labfrog_shots is None:
        nexus_shots = (
            read_labfrog_nexus_shots(args.labfrog_nexus) if args.labfrog_nexus else []
        )
        sqlite_shots = (
            read_labfrog_sqlite_shots(args.labfrog_sqlite)
            if args.labfrog_sqlite
            else []
        )
        mongo_shots = load_mongo_shots(args)
        labfrog_shots = merge_labfrog_shots(nexus_shots, sqlite_shots, mongo_shots)
    if args.watchdog_jsonl:
        watchdog_experiment = select_experiment_id(
            args.experiment_id, events, labfrog_shots, args.labfrog_nexus
        )
        events.extend(
            normalize_watchdog_document(document, experiment_id=watchdog_experiment)
            for document in load_json_records(args.watchdog_jsonl)
        )
    if args.trigger_jsonl:
        events.extend(
            normalize_processed_trigger_message(
                document, experiment_id=args.experiment_id
            )
            for document in load_json_records(args.trigger_jsonl)
        )
    experiment_id = select_experiment_id(
        args.experiment_id, events, labfrog_shots, args.labfrog_nexus
    )
    output_nexus = args.output_nexus.resolve()
    sources_file = (
        args.sources_file.resolve()
        if args.sources_file
        else output_nexus.parent / "hzdr_sources.json"
    )
    schedule = (
        load_campaign_schedule(args.campaign_schedule)
        if getattr(args, "campaign_schedule", None)
        else []
    )
    # Campaign rulings (resolution step 3) are read from this campaign's own
    # review sidecar plus any shared sidecars named on the command line - the
    # ``_unassigned`` bucket build needs the latter to see a ruling written by
    # the campaign it assigned the shot to.
    rulings = (
        experiment_rulings
        if experiment_rulings is not None
        else load_experiment_rulings([
            review_sidecar_path(sources_file),
            *(getattr(args, "experiment_rulings", None) or []),
        ])
    )
    shots, normalized_events = reconcile_canonical_shots(
        events,
        experiment_id=experiment_id,
        source_key=args.source_key,
        labfrog_shots=labfrog_shots,
        match_tolerance_s=args.match_tolerance_s,
        campaign_timezone=args.campaign_timezone,
        campaign_schedule=schedule,
        experiment_rulings=rulings,
        time_match_autoassign=getattr(args, "time_match_autoassign", False),
        include_trigger_only=True,
        resolution_labfrog_shots=resolution_labfrog_shots,
    )

    if args.labfrog_nexus:
        labfrog_products = discover_labfrog_data_products(args.labfrog_nexus, shots)
        products_by_shot: dict[str, list[dict[str, Any]]] = {}
        for product in labfrog_products:
            product["path"] = str(args.output_nexus.resolve())
            products_by_shot.setdefault(product["shot_key"], []).append(product)
        for shot in shots:
            shot["data_products"].extend(products_by_shot.get(shot["shot_key"], []))

    # Reconciliation above only reads inputs; only the publish step below
    # touches this campaign's shared output files, so that is what a second
    # concurrent invocation must not be allowed to race on.
    with single_writer_lock(output_nexus):
        write_nexus_bridge(
            output_path=output_nexus,
            experiment_id=experiment_id,
            shots=shots,
            events=normalized_events,
            source_nexus=args.labfrog_nexus,
            laser_config=_laser_config(),
            # A shared-catalog build's shots move between campaigns; see
            # write_nexus_bridge. The single-campaign build is unchanged.
            seed_from_output=not merge_catalog,
        )
        scicat = (
            _register_scicat(
                output_nexus,
                sources_file,
                experiment_id,
                args.source_key,
                shots,
                events=normalized_events,
            )
            if register_scicat
            else None
        )
        write_sources_catalog(
            sources_file=sources_file,
            source_key=args.source_key,
            experiment_id=experiment_id,
            nexus_path=output_nexus,
            shots=shots,
            events=normalized_events,
            scicat=scicat,
            merge=merge_catalog,
            title=catalog_title,
        )
    return output_nexus, sources_file


# Per-campaign inputs that --output-root derives itself; naming one as well
# would leave it unclear which campaign it belongs to.
_SINGLE_CAMPAIGN_FLAGS = (
    ("experiment_id", "--experiment-id"),
    ("labfrog_nexus", "--labfrog-nexus"),
    ("labfrog_sqlite", "--labfrog-sqlite"),
    ("mongo_uri", "--mongo-uri"),
    ("events_jsonl", "--events-jsonl"),
    ("event_json", "--event-json"),
    ("watchdog_jsonl", "--watchdog-jsonl"),
    ("trigger_jsonl", "--trigger-jsonl"),
)


def _spool_roots(pairs: list[list[str]] | None) -> list[SpoolRoot]:
    return [SpoolRoot(Path(directory), filename) for directory, filename in pairs or []]


def _load_unassigned_events(
    events_files: list[Path], trigger_files: list[Path]
) -> list[dict[str, Any]]:
    """The shared ``_unassigned`` spools, loaded the way each build loads them."""
    events = load_normalized_events(events_files)
    events.extend(
        normalize_processed_trigger_message(document)
        for document in load_json_records(trigger_files)
    )
    return events


def build_all(args: argparse.Namespace) -> int:
    """Build every campaign that receives events, plus the ``_unassigned`` bucket.

    Readiness plan C2; the rules are in ``damnit_api.consumer.campaign_builds``.
    Each campaign is a full single-campaign ``build`` (its own output and
    single-writer lock) whose entry is merged into one shared catalog. A failed
    campaign does not stop the others. Returns the number of failed builds.
    """
    output_root: Path = args.output_root.resolve()
    curated_root: Path | None = args.curated_root
    sources_file = (
        args.sources_file.resolve()
        if args.sources_file
        else output_root / CATALOG_FILENAME
    )
    events_spools = _spool_roots(args.events_spool)
    trigger_spools = _spool_roots(args.trigger_spool)
    spooled = discover_spool_campaigns(events_spools, trigger_spools)
    unassigned_events_files = unassigned_spool_files(events_spools)
    unassigned_trigger_files = unassigned_spool_files(trigger_spools)

    # The campaigns taking shots: their LabFrog records decide resolution step 1
    # in every build of this run.
    active = list(dict.fromkeys([*(args.campaign or []), *sorted(spooled)]))
    exports: dict[str, list[dict[str, Any]]] = {}
    resolution_shots: list[dict[str, Any]] = []
    for campaign in active:
        exports[campaign] = _campaign_export_records(curated_root, campaign)
        resolution_shots.extend(stamp_campaign(exports[campaign], campaign))

    schedule = (
        load_campaign_schedule(args.campaign_schedule) if args.campaign_schedule else []
    )
    rulings = load_experiment_rulings([
        review_sidecar_path(sources_file),
        *(args.experiment_rulings or []),
    ])
    resolved = campaigns_for_unassigned(
        _load_unassigned_events(unassigned_events_files, unassigned_trigger_files),
        labfrog_shots=resolution_shots,
        campaign_schedule=schedule,
        experiment_rulings=rulings,
        campaign_timezone=args.campaign_timezone,
    )
    campaigns = [*active, *sorted(set(resolved) - set(active))]

    failures = 0
    for campaign in [*campaigns, UNASSIGNED_EXPERIMENT_ID]:
        inputs = spooled.get(campaign) or CampaignInputs(campaign)
        is_bucket = campaign == UNASSIGNED_EXPERIMENT_ID
        campaign_args = argparse.Namespace(**{
            **vars(args),
            "events_jsonl": [*inputs.events_jsonl, *unassigned_events_files],
            "event_json": None,
            "watchdog_jsonl": None,
            "trigger_jsonl": [*inputs.trigger_jsonl, *unassigned_trigger_files],
            "labfrog_nexus": None,
            "labfrog_sqlite": None,
            "mongo_uri": None,
            "experiment_id": campaign,
            "source_key": campaign,
            "output_nexus": campaign_output_nexus(output_root, campaign),
            "sources_file": sources_file,
        })
        try:
            labfrog_shots = exports.get(campaign)
            if labfrog_shots is None:
                labfrog_shots = _campaign_export_records(curated_root, campaign)
            output_nexus, _ = build(
                campaign_args,
                labfrog_shots=labfrog_shots,
                resolution_labfrog_shots=resolution_shots,
                experiment_rulings=rulings,
                merge_catalog=True,
                catalog_title=UNASSIGNED_SOURCE_TITLE if is_bucket else None,
                # The bucket is not a campaign, so not a SciCat dataset.
                register_scicat=not is_bucket,
            )
        except Exception:
            failures += 1
            print(f"Build failed for campaign {campaign}:", file=sys.stderr)
            traceback.print_exc()
            continue
        print(f"Canonical NeXus ({campaign}): {output_nexus}")
    print(f"DAMNIT source catalog: {sources_file}")
    return failures


def _campaign_export_records(
    curated_root: Path | None, campaign: str
) -> list[dict[str, Any]]:
    """The campaign's LabFrog export records; none when it has no export."""
    export = campaign_labfrog_export(curated_root, campaign)
    if export is None:
        if curated_root is not None and campaign != UNASSIGNED_EXPERIMENT_ID:
            print(f"No LabFrog export for {campaign}; building from its events")
        return []
    records = read_labfrog_sqlite_shots(export)
    foreign = foreign_experiment_ids(records, campaign)
    if foreign:
        print(
            f"Warning: {export} has rows naming {', '.join(sorted(foreign))}, "
            f"not {campaign}; they resolve to the campaign they name",
            file=sys.stderr,
        )
    return records


def _laser_config() -> dict[str, Any]:
    """Fixed laser-system constants for this deployment (empty unless set).

    The fields no per-shot producer supplies — central wavelength, repetition
    rate, polarization, system name — are stated once as DW_API_HZDR_LASER__*
    settings and filled into /entry/instrument/laser here; see
    hzdr/docs/standards-alignment.md §3.10 and the HZDRLaserSettings docstring.
    Read the same lazy way as the SciCat block below, so the builder keeps
    working as a standalone script in an unconfigured checkout.
    """
    from damnit_api.shared.settings import settings

    return settings.hzdr_laser.as_metadata()


def _register_scicat(
    output_nexus: Path,
    sources_file: Path,
    experiment_id: str,
    source_key: str,
    shots: list[dict[str, Any]],
    *,
    events: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Best-effort SciCat registration post-step (no-op unless configured)."""
    from damnit_api.metadata.scicat import (
        read_previous_registration,
        register_campaign_nexus,
    )
    from damnit_api.shared.settings import settings

    if not settings.hzdr_scicat.enabled:
        return None
    previous = read_previous_registration(sources_file, source_key)
    scientific_metadata = {"experiment_id": experiment_id, "shot_count": len(shots)}
    if settings.hzdr_scicat.endpoint == "publish":
        from damnit_api.metadata.hzdr_scicat_summary import campaign_summary

        scientific_metadata = campaign_summary(experiment_id, shots, events or [])
    result = register_campaign_nexus(
        settings=settings.hzdr_scicat,
        nexus_path=output_nexus,
        experiment_id=experiment_id,
        source_key=source_key,
        scientific_metadata=scientific_metadata,
        source_folder=str(output_nexus.parent),
        previous=previous,
    )
    # One line per build on stdout: the auto-trigger copies "SciCat:" lines
    # into the API's log, so every registration is visible in the journal.
    print(scicat_outcome(source_key, previous, result), flush=True)
    return result


def scicat_outcome(
    source_key: str,
    previous: dict[str, Any] | None,
    result: dict[str, Any] | None,
) -> str:
    """The ``SciCat:`` line for one campaign's registration step."""
    if result is None:
        return f"SciCat: {source_key}: not registered (see the builder's log)"
    pid = result.get("scicat_pid")
    action = result.get("scicat_action")
    if action:
        stage = result.get("scicat_failed_stage")
        suffix = f" (stage: {stage})" if stage else ""
        return f"SciCat: {source_key}: {action}, dataset {pid or 'pending'}{suffix}"
    if previous and previous.get("scicat_pid") == pid:
        return f"SciCat: {source_key}: unchanged, kept dataset {pid}"
    return f"SciCat: {source_key}: registered new dataset {pid}"


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description=(
            "Preserve a LabFrog NeXus export and add canonical DAMNIT shot, "
            "source-event, and data-product bridges."
        )
    )
    parser.add_argument(
        "--events-jsonl",
        action="append",
        type=Path,
        help="Normalized JSONL staging file; repeat for each source.",
    )
    parser.add_argument(
        "--event-json",
        action="append",
        type=Path,
        help="One normalized JSON event file; repeat as needed.",
    )
    parser.add_argument(
        "--watchdog-jsonl",
        action="append",
        type=Path,
        help=(
            "Raw DAQ File Watchdog processed JSON/JSONL; DAMNIT adapts its "
            "watch/event/analysis document to the normalized contract."
        ),
    )
    parser.add_argument(
        "--trigger-jsonl",
        action="append",
        type=Path,
        help=(
            "Legacy ZMQ/Kafka processed_message trigger JSON/JSONL. The "
            "adapter preserves channel/run/counter fields without treating "
            "them as canonical shot numbers."
        ),
    )
    parser.add_argument("--labfrog-nexus", type=Path)
    parser.add_argument("--labfrog-sqlite", type=Path)
    parser.add_argument("--mongo-uri")
    parser.add_argument("--mongo-database")
    parser.add_argument("--mongo-collection")
    parser.add_argument("--mongo-query-json", default="")
    parser.add_argument("--experiment-id")
    parser.add_argument("--source-key", default="hzdr-labfrog")
    outputs = parser.add_mutually_exclusive_group(required=True)
    outputs.add_argument(
        "--output-nexus",
        "--output-hdf5",
        dest="output_nexus",
        type=Path,
    )
    outputs.add_argument(
        "--output-root",
        type=Path,
        help=(
            "Multi-campaign mode: build every campaign with spool data (and "
            "every --campaign) to <root>/<campaign>/<campaign>.nxs, plus the "
            "_unassigned bucket, into one shared catalog (default "
            "<root>/hzdr_sources.json). Replaces --output-nexus, "
            "--experiment-id and the LabFrog/event inputs."
        ),
    )
    parser.add_argument(
        "--curated-root",
        type=Path,
        help=(
            "With --output-root: where each campaign's LabFrog export is "
            "found, as <root>/<campaign>/<campaign>.sqlite."
        ),
    )
    parser.add_argument(
        "--campaign",
        action="append",
        help=(
            "With --output-root: a campaign taking shots now. It is built even "
            "before an event names it, and its LabFrog export may claim "
            "'unassigned' triggers. Repeat as needed."
        ),
    )
    parser.add_argument(
        "--events-spool",
        action="append",
        nargs=2,
        metavar=("DIR", "FILENAME"),
        help=(
            "With --output-root: a normalized-event spool laid out as "
            "DIR/<campaign>/FILENAME (the ASAPO consumer's); repeatable."
        ),
    )
    parser.add_argument(
        "--trigger-spool",
        action="append",
        nargs=2,
        metavar=("DIR", "FILENAME"),
        help=(
            "With --output-root: a trigger spool laid out as "
            "DIR/<campaign>/FILENAME (the Kafka consumer's); repeatable."
        ),
    )
    parser.add_argument("--sources-file", type=Path)
    parser.add_argument(
        "--require-mount",
        action="append",
        type=Path,
        default=[],
        metavar="DIR",
        help=(
            "Refuse to build unless DIR is a mounted file system, e.g. the "
            "share holding --output-root; repeatable. The nearest /etc/fstab "
            "mount point above the output is checked either way."
        ),
    )
    parser.add_argument("--match-tolerance-s", type=float, default=120.0)
    parser.add_argument(
        "--campaign-timezone",
        default="UTC",
        help=(
            "IANA timezone used for naive LabFrog date_time values and the "
            "date-scoped shot identity, for example Europe/Berlin."
        ),
    )
    parser.add_argument(
        "--campaign-schedule",
        type=Path,
        help=(
            "LabFrog labfrog-campaign-schedule-v1 export "
            "(scripts/export_campaign_schedule.py); routes 'unassigned' events "
            "whose trigger time falls in exactly one window (resolution step 2)."
        ),
    )
    parser.add_argument(
        "--experiment-rulings",
        action="append",
        type=Path,
        help=(
            "Extra review sidecar(s) to read campaign rulings from, in addition "
            "to this build's own; repeat as needed."
        ),
    )
    parser.add_argument(
        "--time-match-autoassign",
        action=argparse.BooleanOptionalAction,
        default=False,
        help=(
            "Let the time-based match ranks attach events automatically, the "
            "pre-2026-09-30 ladder. Off by default (ruling A7): they propose "
            "review candidates, and a shot_number naming exactly one shot "
            "attaches on the number alone."
        ),
    )
    args = parser.parse_args()

    output = args.output_root or (args.output_nexus and args.output_nexus.parent)
    if output is not None:
        unmounted = missing_mount(output, args.require_mount)
        if unmounted is not None:
            sys.exit(
                f"Refusing to build: {unmounted} is not mounted, so {output} is "
                "a folder on this machine's own disk, and the share would hide "
                "anything written there once it is mounted again. Mount it first."
            )

    if args.output_root is not None:
        conflicting = [
            flag for name, flag in _SINGLE_CAMPAIGN_FLAGS if getattr(args, name)
        ]
        if conflicting:
            parser.error(
                "--output-root derives each campaign's inputs; drop "
                + ", ".join(conflicting)
            )
        sys.exit(1 if build_all(args) else 0)
    multi_only = [
        flag
        for name, flag in (
            ("curated_root", "--curated-root"),
            ("campaign", "--campaign"),
            ("events_spool", "--events-spool"),
            ("trigger_spool", "--trigger-spool"),
        )
        if getattr(args, name)
    ]
    if multi_only:
        parser.error(", ".join(multi_only) + " only apply with --output-root")
    output_nexus, sources_file = build(args)
    print(f"Canonical NeXus: {output_nexus}")
    print(f"DAMNIT source catalog: {sources_file}")


if __name__ == "__main__":
    main()
