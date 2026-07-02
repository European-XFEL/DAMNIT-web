"""Generate throwaway HZDR example files for local DAMNIT-web testing."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import h5py
import numpy as np


@dataclass(frozen=True)
class ExampleShot:
    """One small shot row mirrored into JSON, Mongo, and HDF5 examples."""

    source_key: str
    shot_number: int
    fired_at: str
    hdf5_path: str
    metadata: dict[str, object]


def build_shots(output_dir: Path, source_key: str) -> list[ExampleShot]:
    """Build deterministic HZDR-style shot rows for a local smoke test."""
    start_time = datetime(2026, 5, 5, 10, 0, tzinfo=UTC)
    shots: list[ExampleShot] = []
    for index in range(3):
        shot_number = 1001 + index
        hdf5_path = output_dir / "hdf5" / f"shot-{shot_number}.h5"
        shots.append(
            ExampleShot(
                source_key=source_key,
                shot_number=shot_number,
                fired_at=(start_time + timedelta(seconds=90 * index)).isoformat(),
                hdf5_path=str(hdf5_path),
                metadata={
                    "status": "processed" if index < 2 else "needs-review",
                    "target": {
                        "type": "other",
                        "name": f"target-{index + 1}",
                        "provenance": "manual",
                    },
                    # Namespaced bare key per the metadata key registry
                    # (CLAUDE.md "Metadata key registry", signed off
                    # 2026-07-02; docs/target-ontology.md §5).
                    "laser": {"pulse_energy": round(12.5 + index * 0.2, 2)},
                    "diagnostics": {
                        "lineout_dataset": "diagnostics/lineout",
                        "detector_dataset": "diagnostics/detector_image",
                        "preview_dataset": "diagnostics/image_preview",
                    },
                },
            )
        )
    return shots


def write_hdf5_files(shots: list[ExampleShot]) -> None:
    """Write one tiny HDF5 file per shot."""
    for shot in shots:
        file_path = Path(shot.hdf5_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        rng = np.random.default_rng(shot.shot_number)
        lineout = np.sin(np.linspace(0, np.pi * 4, 128)) + rng.normal(0, 0.05, 128)
        detector_image = rng.normal(0, 0.2, (64, 64))
        detector_image[24:40, 28:36] += 4
        with h5py.File(file_path, "w") as handle:
            handle.attrs["profile"] = "hzdr-example"
            handle.attrs["source_key"] = shot.source_key
            handle.attrs["shot_number"] = shot.shot_number
            handle.attrs["fired_at"] = shot.fired_at
            diagnostics = handle.create_group("diagnostics")
            diagnostics.create_dataset("signal", data=np.asarray([1.0, 1.2, 1.1]))
            diagnostics.create_dataset("lineout", data=lineout)
            diagnostics.create_dataset("detector_image", data=detector_image)
            diagnostics.create_dataset("image_preview", data=detector_image[::8, ::8])


def write_source_json(
    output_dir: Path,
    source_key: str,
    shots: list[ExampleShot],
) -> Path:
    """Write a local provider JSON file that DAMNIT-web can read directly."""
    source_file = output_dir / "hzdr_sources.json"
    payload = {
        "sources": [
            {
                "key": source_key,
                "title": "Generated HZDR example",
                "damnit_path": str(output_dir / "damnit" / source_key),
                "data_paths": [shot.hdf5_path for shot in shots],
                "metadata": {
                    "facility": "HZDR",
                    "source_type": "generated-example",
                },
                "shots": [asdict(shot) for shot in shots],
            }
        ]
    }
    source_file.parent.mkdir(parents=True, exist_ok=True)
    source_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return source_file


def write_mongo_seed(output_dir: Path, shots: list[ExampleShot]) -> Path:
    """Write MongoDB shot documents for optional manual import."""
    seed_file = output_dir / "mongo" / "shots.seed.json"
    documents = [
        {
            "source_key": shot.source_key,
            "shot_number": shot.shot_number,
            "fired_at": shot.fired_at,
            "hdf5_path": shot.hdf5_path,
            **shot.metadata,
        }
        for shot in shots
    ]
    seed_file.parent.mkdir(parents=True, exist_ok=True)
    seed_file.write_text(json.dumps(documents, indent=2), encoding="utf-8")
    return seed_file


def main() -> None:
    """Generate local example data under an ignored output directory."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("../.generated/hzdr-example"),
    )
    parser.add_argument("--source-key", default="hzdr-example")
    args = parser.parse_args()

    output_dir = args.output_dir.resolve()
    shots = build_shots(output_dir, args.source_key)
    write_hdf5_files(shots)
    source_file = write_source_json(output_dir, args.source_key, shots)
    seed_file = write_mongo_seed(output_dir, shots)

    print(f"Generated {len(shots)} HZDR example shots")
    print(f"Source JSON: {source_file}")
    print(f"Mongo seed: {seed_file}")
    print("Run local example mode with:")
    print(f"$env:DW_API_METADATA__SOURCES_FILE = '{source_file}'")
    print(".\\scripts\\hzdr-dev.ps1 -Provider local -WithGui")


if __name__ == "__main__":
    main()
