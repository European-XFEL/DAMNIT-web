"""Build the canonical HZDR NeXus bridge consumed by DAMNIT-web."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

os.environ.setdefault("DW_API_DAMNIT_PATH", str(Path.cwd()))

from damnit_api.metadata.hzdr_nexus import (
    discover_labfrog_data_products,
    load_normalized_events,
    merge_labfrog_shots,
    normalize_labfrog_mongo_shots,
    normalize_processed_trigger_message,
    normalize_watchdog_document,
    read_labfrog_nexus_shots,
    read_labfrog_sqlite_shots,
    reconcile_canonical_shots,
    single_writer_lock,
    write_nexus_bridge,
    write_sources_catalog,
)


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
    """Choose one experiment boundary and reject mixed event batches."""
    if explicit:
        return explicit
    event_ids = {str(event["experiment_id"]) for event in events}
    if len(event_ids) == 1:
        return event_ids.pop()
    if len(event_ids) > 1:
        message = "Provide --experiment-id for mixed events: " + ", ".join(
            sorted(event_ids)
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
    message = "Could not infer experiment_id; provide --experiment-id"
    raise ValueError(message)


def build(args: argparse.Namespace) -> tuple[Path, Path]:
    """Run one reconciliation and NeXus bridge build."""
    event_paths = [*(args.events_jsonl or []), *(args.event_json or [])]
    events = load_normalized_events(event_paths)
    nexus_shots = (
        read_labfrog_nexus_shots(args.labfrog_nexus) if args.labfrog_nexus else []
    )
    sqlite_shots = (
        read_labfrog_sqlite_shots(args.labfrog_sqlite) if args.labfrog_sqlite else []
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
    shots, normalized_events = reconcile_canonical_shots(
        events,
        experiment_id=experiment_id,
        source_key=args.source_key,
        labfrog_shots=labfrog_shots,
        match_tolerance_s=args.match_tolerance_s,
        campaign_timezone=args.campaign_timezone,
    )

    if args.labfrog_nexus:
        labfrog_products = discover_labfrog_data_products(args.labfrog_nexus, shots)
        products_by_shot: dict[str, list[dict[str, Any]]] = {}
        for product in labfrog_products:
            product["path"] = str(args.output_nexus.resolve())
            products_by_shot.setdefault(product["shot_key"], []).append(product)
        for shot in shots:
            shot["data_products"].extend(products_by_shot.get(shot["shot_key"], []))

    output_nexus = args.output_nexus.resolve()
    sources_file = (
        args.sources_file.resolve()
        if args.sources_file
        else output_nexus.parent / "hzdr_sources.json"
    )
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
        )
        write_sources_catalog(
            sources_file=sources_file,
            source_key=args.source_key,
            experiment_id=experiment_id,
            nexus_path=output_nexus,
            shots=shots,
            events=normalized_events,
        )
    return output_nexus, sources_file


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
            "Raw PLANET-Watchdog processed JSON/JSONL; DAMNIT adapts its "
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
    parser.add_argument(
        "--output-nexus",
        "--output-hdf5",
        dest="output_nexus",
        type=Path,
        required=True,
    )
    parser.add_argument("--sources-file", type=Path)
    parser.add_argument("--match-tolerance-s", type=float, default=120.0)
    parser.add_argument(
        "--campaign-timezone",
        default="UTC",
        help=(
            "IANA timezone used for naive LabFrog date_time values and the "
            "date-scoped shot identity, for example Europe/Berlin."
        ),
    )
    args = parser.parse_args()

    output_nexus, sources_file = build(args)
    print(f"Canonical NeXus: {output_nexus}")
    print(f"DAMNIT source catalog: {sources_file}")


if __name__ == "__main__":
    main()
