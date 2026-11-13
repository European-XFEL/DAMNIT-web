#!/usr/bin/env python3
"""Inspect an existing campaign for SciCat without rebuilding or publishing it."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import h5py

from damnit_api.metadata.hzdr_nexus import write_json_atomic
from damnit_api.metadata.hzdr_scicat_summary import campaign_files, campaign_summary
from damnit_api.metadata.scicat import read_previous_registration


def inspect_campaign(catalog: Path, master: Path, campaign: str) -> dict:
    """Use the source catalogue's canonical shots, with explicit projection limits."""
    payload = json.loads(catalog.read_text(encoding="utf-8"))
    matches = [
        source
        for source in payload["sources"]
        if source.get("metadata", {}).get("experiment_id") == campaign
        or source.get("key") == campaign
    ]
    if len(matches) != 1:
        message = "Expected exactly one catalogue source for this campaign"
        raise ValueError(message)
    source = matches[0]
    shots = source.get("shots", [])
    if any(
        shot.get("metadata", {}).get("experiment_id", campaign) != campaign
        for shot in shots
    ):
        message = "Catalogue source contains shots from another campaign"
        raise ValueError(message)
    # This is a projection, not a substitute for the builder's full normalized
    # event input. In particular review_level may not survive the API projection.
    projected = [event for shot in shots for event in shot.get("events", [])]
    projected.extend(source.get("review_events", []))
    events = {}
    for index, event in enumerate(projected):
        events.setdefault(event.get("event_id") or f"missing-id-{index}", event)
    summary = campaign_summary(campaign, shots, list(events.values()))
    summary["provenance"]["shots"] = "current source catalogue snapshot"
    summary["provenance"]["events"] = (
        "catalogue event projection, deduplicated by event_id"
    )
    previous = read_previous_registration(catalog, source["key"])
    registration = (
        {
            key: previous.get(key)
            for key in (
                "scicat_pid",
                "scicat_endpoint",
                "scicat_identity",
                "scicat_publisher",
            )
        }
        if previous
        else None
    )
    with h5py.File(master, "r") as handle:
        if handle.attrs.get("experiment_id") != campaign:
            message = "Master campaign identity is missing or differs from --campaign"
            raise ValueError(message)
        table = handle.get("entry/shots/shot_key")
        if not isinstance(table, h5py.Dataset) or table.ndim != 1:
            message = "Master has no canonical shot-key column"
            raise ValueError(message)
        master_keys = table.asstr()[...].tolist()
    catalog_keys = [shot.get("shot_key") for shot in shots]
    selected = campaign_files(master)
    warnings = [
        "No HTTP requests, campaign rebuilds or SciCat writes are performed.",
        "Catalogue event projections may omit review levels and normalized fields.",
        "Superseded-record counts describe this catalogue snapshot only.",
        "Local readability does not establish SciCat download/archive/retrieve access.",
    ]
    keys_match = master_keys == catalog_keys
    if not keys_match:
        warnings.append(
            "Catalogue/master shot keys differ; reconcile before publishing."
        )
    migration = bool(previous and previous.get("scicat_endpoint") != "publish")
    if migration:
        warnings.append(
            "Existing legacy PID requires reviewed migration; no automatic adoption."
        )
    return {
        "schema": "fwkt-scicat-campaign-inspection-v1",
        "read_only": True,
        "campaign": campaign,
        "source_key": source["key"],
        "master": str(master),
        "catalogue": str(catalog),
        "registration": registration,
        "legacy_migration_required": migration,
        "catalogue_shot_keys_match_master": keys_match,
        "master_shot_rows": len(master_keys),
        "metadata_preview": summary,
        "inventory": [
            {"path": str(path), "size": path.stat().st_size} for path in selected
        ],
        "file_count": len(selected),
        "warnings": warnings,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogue", type=Path, required=True)
    parser.add_argument("--master", type=Path, required=True)
    parser.add_argument("--campaign", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    master = args.master.expanduser().resolve(strict=True)
    catalogue = args.catalogue.expanduser().resolve(strict=True)
    output = args.out.expanduser().resolve()
    if output == catalogue or output.is_relative_to(master.parent):
        message = "Save the report outside the campaign directory and source catalogue"
        raise ValueError(message)
    report = inspect_campaign(catalogue, master, args.campaign)
    write_json_atomic(output, report)
    print(f"Read-only inspection saved: {output}")


if __name__ == "__main__":
    main()
