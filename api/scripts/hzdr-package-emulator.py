"""Emulate the HZDR normalized data-package handoff for local testing."""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import h5py
import numpy as np

os.environ.setdefault("DW_API_DAMNIT_PATH", str(Path.cwd()))

from damnit_api.metadata.hzdr_nexus import (
    reconcile_canonical_shots,
    write_json_atomic,
    write_nexus_bridge,
    write_sources_catalog,
)

REQUIRED_EVENT_FIELDS = {
    "experiment_id",
    "shot_id",
    "source",
    "kind",
    "timestamp",
    "transport",
    "payload_ref",
}


@dataclass(frozen=True)
class EmulatedPackage:
    """Files produced by one emulator run."""

    output_dir: Path
    events_dir: Path
    hdf5_path: Path
    sources_file: Path


def load_event(path: Path) -> dict[str, Any]:
    """Load and validate one normalized HZDR event package."""
    event = json.loads(path.read_text(encoding="utf-8"))
    missing = sorted(REQUIRED_EVENT_FIELDS - set(event))
    if missing:
        msg = f"{path} is missing required field(s): {', '.join(missing)}"
        raise ValueError(msg)

    if not isinstance(event["payload_ref"], dict):
        msg = f"{path} field payload_ref must be an object"
        raise ValueError(msg)
    if "values" in event and not isinstance(event["values"], list):
        msg = f"{path} field values must be a list when present"
        raise ValueError(msg)
    if "metadata" in event and not isinstance(event["metadata"], dict):
        msg = f"{path} field metadata must be an object when present"
        raise ValueError(msg)
    return event


def load_events(events_dir: Path) -> list[dict[str, Any]]:
    """Load all normalized JSON examples from an events directory."""
    event_paths = sorted(events_dir.glob("*.json"))
    if not event_paths:
        msg = f"No *.json event packages found in {events_dir}"
        raise ValueError(msg)
    return [load_event(path) for path in event_paths]


def expand_events(
    events: list[dict[str, Any]],
    *,
    shot_count: int,
    shot_increment: int,
    random_seed: int = 20260529,
) -> list[dict[str, Any]]:
    """Repeat one set of event packages across multiple shot IDs."""
    if shot_count <= 1:
        return events

    expanded_events: list[dict[str, Any]] = []
    for index in range(shot_count):
        expanded_events.extend(
            mutate_event_for_shot(
                event,
                index=index,
                shot_increment=shot_increment,
                random_seed=random_seed,
            )
            for event in events
        )
    return expanded_events


def mutate_event_for_shot(
    event: dict[str, Any],
    *,
    index: int,
    shot_increment: int,
    random_seed: int = 20260529,
) -> dict[str, Any]:
    """Create a deterministic per-shot variant while preserving event shape."""
    mutated = json.loads(json.dumps(event))
    rng = np.random.default_rng(random_seed + index)
    shot_id = str(mutated["shot_id"])
    mutated["shot_id"] = increment_shot_id(shot_id, index * shot_increment)
    mutated["timestamp"] = increment_timestamp(str(mutated["timestamp"]), index)

    payload_ref = mutated.get("payload_ref")
    if isinstance(payload_ref, dict):
        if isinstance(payload_ref.get("message_id"), int):
            payload_ref["message_id"] += index * shot_increment
        if isinstance(payload_ref.get("offset"), int):
            payload_ref["offset"] += index * shot_increment

    values = mutated.get("values")
    if isinstance(values, list):
        mutated["values"] = [
            round(float(value) + index * 0.1 + float(rng.normal(0, 0.025)), 6)
            if isinstance(value, int | float)
            else value
            for value in values
        ]

    metadata = mutated.setdefault("metadata", {})
    if isinstance(metadata, dict):
        # Numeric laser/vacuum/target fields are namespaced bare keys per the
        # metadata key registry (CLAUDE.md "Metadata key registry", signed
        # off 2026-07-02; see also hzdr/docs/target-ontology.md §5) - no unit
        # suffix in the key name, canonical unit fixed in
        # hzdr_event.METADATA_KEY_REGISTRY.
        energy = 12.4 + index * 0.17 + float(rng.normal(0, 0.06))
        pressure = 2.5e-5 * (1 + index * 0.04 + float(rng.normal(0, 0.01)))
        xray_counts = int(1450 + index * 37 + rng.integers(-18, 19))
        temperature = 21.5 + index * 0.25 + float(rng.normal(0, 0.04))
        detector_signal = 2.25 + index * 0.22 + float(rng.normal(0, 0.05))
        metadata["emulated_sequence"] = index + 1
        metadata["emulated_shot_increment"] = shot_increment
        metadata["status"] = "processed" if index % 5 else "needs-review"
        metadata["target"] = {
            "type": "other",
            "name": f"target-{(index % 4) + 1}",
            "provenance": "manual",
            "temperature": round(temperature, 2),
        }
        metadata["laser"] = {
            "pulse_energy": round(energy, 3),
            "pulse_duration": round(42.0 + index * 0.35, 2),
            "beam_pos_x": round(-0.35 + index * 0.015, 4),
            "beam_pos_y": round(0.18 - index * 0.012, 4),
        }
        metadata["vacuum"] = {"chamber_pressure": round(pressure, 8)}
        metadata["xray_counts"] = xray_counts
        metadata["detector_signal_mean"] = round(detector_signal, 4)
        metadata["alignment_score"] = round(0.82 + (index % 6) * 0.025, 4)
        metadata["operator"] = ["alex", "sam", "lee"][index % 3]
    return mutated


def increment_shot_id(shot_id: str, increment: int) -> str:
    """Increment the final numeric run in a shot ID while keeping its width."""
    if increment == 0:
        return shot_id
    end = len(shot_id)
    start = end
    while start > 0 and shot_id[start - 1].isdigit():
        start -= 1
    if start == end:
        return f"{shot_id}-{increment + 1:06d}"
    digits = shot_id[start:end]
    return f"{shot_id[:start]}{int(digits) + increment:0{len(digits)}d}"


def increment_timestamp(timestamp: str, index: int) -> str:
    """Offset ISO timestamps by one second per generated shot."""
    try:
        normalized = timestamp.replace("Z", "+00:00")
        return (
            datetime.fromisoformat(normalized) + timedelta(seconds=index)
        ).isoformat()
    except ValueError:
        return timestamp


def select_experiment(events: list[dict[str, Any]], experiment_id: str | None) -> str:
    """Pick the experiment boundary for this emulator run."""
    if experiment_id:
        return experiment_id
    experiment_ids = sorted({str(event["experiment_id"]) for event in events})
    if len(experiment_ids) != 1:
        raise ValueError(
            "Provide --experiment-id when the event set contains multiple experiments: "
            + ", ".join(experiment_ids)
        )
    return experiment_ids[0]


def write_staged_events(
    events: list[dict[str, Any]], events_dir: Path
) -> dict[str, Path]:
    """Write production-shaped JSONL staging files by event source."""
    events_dir.mkdir(parents=True, exist_ok=True)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        name = event["source"].lower().replace(" ", "-")
        grouped[name].append(event)

    paths: dict[str, Path] = {}
    for name, source_events in grouped.items():
        path = events_dir / f"{name}.jsonl"
        with path.open("w", encoding="utf-8") as handle:
            for event in source_events:
                handle.write(json.dumps(event, sort_keys=True) + "\n")
        paths[name] = path
    return paths


def encode_json_dataset(
    group: h5py.Group, name: str, values: list[dict[str, Any]]
) -> None:
    """Store JSON records as UTF-8 HDF5 string datasets."""
    dtype = h5py.string_dtype(encoding="utf-8")
    group.create_dataset(
        name,
        data=np.asarray(
            [json.dumps(value, sort_keys=True) for value in values], dtype=dtype
        ),
    )


def write_hdf5(
    events: list[dict[str, Any]], experiment_id: str, hdf5_path: Path
) -> None:
    """Write the combined experiment HDF5 shape used by DAMNIT-web previews."""
    hdf5_path.parent.mkdir(parents=True, exist_ok=True)
    selected_events = [
        event for event in events if str(event["experiment_id"]) == experiment_id
    ]
    if not selected_events:
        msg = f"No events matched experiment_id={experiment_id}"
        raise ValueError(msg)

    string_dtype = h5py.string_dtype(encoding="utf-8")
    with h5py.File(hdf5_path, "w") as handle:
        handle.attrs["profile"] = "hzdr-package-emulator"
        handle.attrs["experiment_id"] = experiment_id
        handle.attrs["generated_at"] = datetime.now(UTC).isoformat()

        index = handle.create_group("index")
        index.create_dataset(
            "shot_id",
            data=np.asarray(
                sorted({str(event["shot_id"]) for event in selected_events}),
                dtype=string_dtype,
            ),
        )
        index.create_dataset(
            "event_shot_id",
            data=np.asarray(
                [str(event["shot_id"]) for event in selected_events], dtype=string_dtype
            ),
        )
        index.create_dataset(
            "timestamp",
            data=np.asarray(
                [str(event["timestamp"]) for event in selected_events],
                dtype=string_dtype,
            ),
        )

        events_group = handle.create_group("events")
        for field in ("source", "kind", "transport"):
            events_group.create_dataset(
                field,
                data=np.asarray(
                    [str(event[field]) for event in selected_events], dtype=string_dtype
                ),
            )
        encode_json_dataset(
            events_group,
            "payload_ref_json",
            [event["payload_ref"] for event in selected_events],
        )
        encode_json_dataset(
            events_group,
            "metadata_json",
            [event.get("metadata", {}) for event in selected_events],
        )

        metadata_group = handle.create_group("metadata")
        metadata_group.create_dataset(
            "shot_id",
            data=np.asarray(
                sorted({str(event["shot_id"]) for event in selected_events}),
                dtype=string_dtype,
            ),
        )
        encode_json_dataset(
            metadata_group,
            "mongodb_by_shot_json",
            [
                {
                    "experiment_id": experiment_id,
                    "shot_id": shot_id,
                    "emulated": True,
                }
                for shot_id in sorted({
                    str(event["shot_id"]) for event in selected_events
                })
            ],
        )
        metadata_group.create_dataset(
            "mongodb_json",
            data=json.dumps(
                {
                    "database": "emulated",
                    "collection": "shots",
                    "experiment_id": experiment_id,
                },
                sort_keys=True,
            ),
        )

        signals_group = handle.create_group("signals")
        for event in selected_events:
            values = event.get("values")
            if values is None:
                continue
            source_group = signals_group.require_group(str(event["source"]))
            kind_group = source_group.require_group(str(event["kind"]))
            if "shot_id" not in kind_group:
                kind_group.create_dataset(
                    "shot_id", shape=(0,), maxshape=(None,), dtype=string_dtype
                )
            if "values" not in kind_group:
                kind_group.create_dataset(
                    "values", shape=(0,), maxshape=(None,), dtype=float
                )
            shot_dataset = kind_group["shot_id"]
            value_dataset = kind_group["values"]
            shot_dataset.resize((shot_dataset.shape[0] + 1,))  # pyright: ignore[reportAttributeAccessIssue]
            value_dataset.resize((value_dataset.shape[0] + len(values),))  # pyright: ignore[reportAttributeAccessIssue]
            shot_dataset[-1] = str(event["shot_id"])  # pyright: ignore[reportIndexIssue]
            value_dataset[-len(values) :] = np.asarray(values, dtype=float)  # pyright: ignore[reportIndexIssue]

        write_fixture_datasets(handle, selected_events)


def write_fixture_datasets(handle: h5py.File, events: list[dict[str, Any]]) -> None:
    """Add representative HDF5 data shapes for context/table preview testing."""
    shot_ids = sorted({str(event["shot_id"]) for event in events})
    metadata_by_shot: dict[str, dict[str, Any]] = {}
    for shot_id in shot_ids:
        merged: dict[str, Any] = {}
        for event in events:
            if str(event["shot_id"]) != shot_id:
                continue
            event_metadata = event.get("metadata", {})
            if isinstance(event_metadata, dict):
                merged.update(event_metadata)
        metadata_by_shot[shot_id] = merged

    fixtures = handle.create_group("fixtures")
    fixtures.attrs["description"] = (
        "Representative scalar, line, image, mask, label, and stack datasets "
        "for DAMNIT context-builder testing."
    )

    line_length = 128
    image_shape = (64, 64)
    stack_shape = (4, 32, 32)
    shot_axis = np.arange(len(shot_ids), dtype=float)
    fixtures.create_dataset("shot_index", data=shot_axis.astype(int))

    scalar_values: list[float] = []
    lineouts: list[np.ndarray] = []
    images: list[np.ndarray] = []
    masks: list[np.ndarray] = []
    labels: list[np.ndarray] = []
    stacks: list[np.ndarray] = []

    for index, shot_id in enumerate(shot_ids):
        metadata = metadata_by_shot[shot_id]
        laser_metadata = metadata.get("laser")
        vacuum_metadata = metadata.get("vacuum")
        energy = float(
            (laser_metadata or {}).get("pulse_energy", 12.0 + index * 0.2)
            if isinstance(laser_metadata, dict)
            else 12.0 + index * 0.2
        )
        pressure = float(
            (vacuum_metadata or {}).get("chamber_pressure", 2.5e-5)
            if isinstance(vacuum_metadata, dict)
            else 2.5e-5
        )
        scalar_values.append(energy)

        x = np.linspace(0, np.pi * 4, line_length)
        lineout = energy + np.sin(x + index * 0.35) * 0.35 + index * 0.05
        lineouts.append(lineout)

        yy, xx = np.mgrid[
            -1 : 1 : complex(image_shape[0]), -1 : 1 : complex(image_shape[1])
        ]
        center_x = -0.25 + index * 0.08
        center_y = 0.18 - index * 0.05
        image = np.exp(-(((xx - center_x) ** 2) / 0.08 + ((yy - center_y) ** 2) / 0.12))
        image += 0.08 * np.sin((index + 1) * xx * np.pi)
        images.append(image.astype(np.float32))
        masks.append((image > 0.45).astype(np.uint8))
        labels.append(np.digitize(image, bins=[0.15, 0.35, 0.6]).astype(np.int16))

        frames = []
        for frame_index in range(stack_shape[0]):
            frame = image[::2, ::2] + frame_index * 0.05
            frames.append(frame[: stack_shape[1], : stack_shape[2]])
        stacks.append(np.asarray(frames, dtype=np.float32))

        shot_group = fixtures.require_group("by_shot").create_group(shot_id)
        scalar_group = shot_group.create_group("scalars")
        scalar_group.create_dataset("laser_energy_j", data=energy)
        scalar_group.create_dataset("chamber_pressure_mbar", data=pressure)
        scalar_group.create_dataset(
            "xray_counts",
            data=int(metadata.get("xray_counts", 1400 + index * 30)),
        )
        shot_group.create_group("lineouts").create_dataset(
            "pulse_energy_j", data=lineout.astype(np.float64)
        )
        image_group = shot_group.create_group("images")
        image_group.create_dataset("camera_raw", data=image.astype(np.float32))
        image_group.create_dataset("camera_mask", data=masks[-1])
        image_group.create_dataset("camera_labels", data=labels[-1])
        shot_group.create_group("stacks").create_dataset(
            "camera_stack", data=stacks[-1]
        )

    scalars_group = fixtures.create_group("scalars")
    scalars_group.create_dataset(
        "laser_energy_j_by_shot", data=np.asarray(scalar_values)
    )
    scalars_group.create_dataset(
        "shot_count",
        data=np.asarray(len(shot_ids), dtype=np.int32),
    )
    fixtures.create_group("lineouts").create_dataset(
        "pulse_energy_j_by_shot", data=np.asarray(lineouts)
    )
    images_group = fixtures.create_group("images")
    images_group.create_dataset("camera_raw_by_shot", data=np.asarray(images))
    images_group.create_dataset("camera_mask_by_shot", data=np.asarray(masks))
    images_group.create_dataset("camera_labels_by_shot", data=np.asarray(labels))
    fixtures.create_group("stacks").create_dataset(
        "camera_stack_by_shot", data=np.asarray(stacks)
    )


def shot_number_from_shot_id(shot_id: str, fallback: int) -> int:
    """Convert shot identifiers like shot-000123 into DAMNIT-web shot numbers."""
    digits = "".join(character for character in shot_id if character.isdigit())
    return int(digits) if digits else fallback


def write_sources_file(
    events: list[dict[str, Any]],
    *,
    source_key: str,
    experiment_id: str,
    hdf5_path: Path,
    sources_file: Path,
) -> None:
    """Write a local HZDR source fixture pointing at the emulated HDF5."""
    shots = []
    seen_shots: set[str] = set()
    events_by_shot: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        if str(event["experiment_id"]) == experiment_id:
            events_by_shot[str(event["shot_id"])].append(event)
    for index, event in enumerate(events, start=1):
        if str(event["experiment_id"]) != experiment_id:
            continue
        shot_id = str(event["shot_id"])
        if shot_id in seen_shots:
            continue
        seen_shots.add(shot_id)
        shots.append({
            "source_key": source_key,
            "shot_number": shot_number_from_shot_id(shot_id, index),
            "fired_at": str(event["timestamp"]),
            "hdf5_path": str(hdf5_path),
            "metadata": build_shot_metadata(
                events_by_shot[shot_id],
                experiment_id=experiment_id,
                shot_id=shot_id,
                hdf5_path=hdf5_path,
            ),
        })

    payload = {
        "sources": [
            {
                "key": source_key,
                "title": f"Emulated HZDR package stream ({experiment_id})",
                "damnit_path": str(sources_file.parent / "damnit" / source_key),
                "data_paths": [str(hdf5_path)],
                "metadata": {
                    "facility": "HZDR",
                    "source_type": "package-emulator",
                    "experiment_id": experiment_id,
                    "combined_hdf5_path": str(hdf5_path),
                },
                "shots": shots,
            }
        ]
    }
    write_json_atomic(sources_file, payload)


def build_shot_metadata(
    events: list[dict[str, Any]],
    *,
    experiment_id: str,
    shot_id: str,
    hdf5_path: Path,
) -> dict[str, Any]:
    """Merge useful fake/live event metadata into one shot metadata record."""
    metadata: dict[str, Any] = {
        "experiment_id": experiment_id,
        "shot_id": shot_id,
        "status": "emulated",
        "combined_hdf5_path": str(hdf5_path),
    }
    for event in events:
        event_metadata = event.get("metadata", {})
        if isinstance(event_metadata, dict):
            metadata.update(event_metadata)
        if event.get("source") == "LaserData" and event.get("values"):
            kind = str(event.get("kind", "value"))
            values = event["values"]
            if isinstance(values, list) and values:
                numeric_values = [
                    float(value) for value in values if isinstance(value, int | float)
                ]
                if numeric_values:
                    metadata[f"{kind}_mean"] = round(
                        sum(numeric_values) / len(numeric_values),
                        4,
                    )
    return metadata


def run_emulator(
    *,
    events_dir: Path,
    output_dir: Path,
    source_key: str,
    experiment_id: str | None,
    shot_count: int = 1,
    shot_increment: int = 1,
    random_seed: int = 20260529,
) -> EmulatedPackage:
    """Build staged events, combined HDF5, and DAMNIT-web source metadata."""
    events = expand_events(
        load_events(events_dir),
        shot_count=shot_count,
        shot_increment=shot_increment,
        random_seed=random_seed,
    )
    selected_experiment = select_experiment(events, experiment_id)
    output_dir = output_dir.resolve()
    staged_dir = output_dir / "events"
    hdf5_path = output_dir / "hdf5" / f"{selected_experiment}.h5"
    sources_file = output_dir / "hzdr_sources.json"

    write_staged_events(events, staged_dir)
    write_hdf5(events, selected_experiment, hdf5_path)
    canonical_shots, normalized_events = reconcile_canonical_shots(
        events,
        experiment_id=selected_experiment,
        source_key=source_key,
    )
    for shot in canonical_shots:
        shot["metadata"].setdefault("status", "emulated")
        shot["metadata"]["combined_hdf5_path"] = str(hdf5_path)
    write_nexus_bridge(
        output_path=hdf5_path,
        experiment_id=selected_experiment,
        shots=canonical_shots,
        events=normalized_events,
    )
    write_sources_catalog(
        sources_file=sources_file,
        source_key=source_key,
        experiment_id=selected_experiment,
        nexus_path=hdf5_path,
        shots=canonical_shots,
    )

    return EmulatedPackage(
        output_dir=output_dir,
        events_dir=staged_dir,
        hdf5_path=hdf5_path,
        sources_file=sources_file,
    )


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--events-dir",
        type=Path,
        required=True,
        help="Directory containing normalized event package JSON files.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("../.generated/hzdr-package-emulator"),
    )
    parser.add_argument("--source-key", default="hzdr-emulator")
    parser.add_argument("--experiment-id", default=None)
    parser.add_argument("--shot-count", type=int, default=1)
    parser.add_argument("--shot-increment", type=int, default=1)
    parser.add_argument("--random-seed", type=int, default=20260529)
    args = parser.parse_args()

    package = run_emulator(
        events_dir=args.events_dir,
        output_dir=args.output_dir,
        source_key=args.source_key,
        experiment_id=args.experiment_id,
        shot_count=args.shot_count,
        shot_increment=args.shot_increment,
        random_seed=args.random_seed,
    )

    print("Generated HZDR package emulator output")
    print(f"Events JSONL: {package.events_dir}")
    print(f"HDF5: {package.hdf5_path}")
    print(f"Source JSON: {package.sources_file}")
    print("Run DAMNIT-web against it with:")
    print("$env:DW_API_METADATA__PROVIDER = 'local'")
    print(f"$env:DW_API_METADATA__SOURCES_FILE = '{package.sources_file}'")
    print(".\\scripts\\hzdr-dev.ps1 -Provider local -WithGui")


if __name__ == "__main__":
    main()
