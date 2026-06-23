"""Regenerate the canonical ``hzdr-event-v1`` test fixtures from the model.

DAMNIT-web-hzdr is the canonical source for the ``hzdr-event-v1`` contract (see
``docs/architecture.md`` and ``api/src/damnit_api/metadata/hzdr_event.py``).
This script rewrites this repo's committed fixtures:

    api/tests/fixtures/hzdr-event-v1.schema.json
    api/tests/fixtures/hzdr-event-v1.sample.json

The same two files are vendored byte-identically into the sibling producer
repos (``planet-watchdog/tests/fixtures/`` and ``shotcounter/tests/fixtures/``).
After regenerating here, copy both files into those repos so their drift-check
tests keep passing - that copy step is the deliberate, reviewable point at which
a contract change crosses repo boundaries.

Run from the repo root:

    uv run python api/scripts/regen_hzdr_event_fixtures.py
"""

from __future__ import annotations

import json
from pathlib import Path

from damnit_api.metadata.hzdr_event import HZDREventV1

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "tests" / "fixtures"

# A representative, fully-valid event covering payload_ref traceability. Kept in
# sync with the schema by validating it against the model below before writing.
SAMPLE_EVENT = {
    "schema_version": "hzdr-event-v1",
    "event_id": "Solenoid_Beamline_Tests_01.2025:draco-trigger:42",
    "experiment_id": "Solenoid_Beamline_Tests_01.2025",
    "shot_id": "shot-000042",
    "shot_number": 42,
    "source": "PLANET-Watchdog",
    "kind": "watchdog.file",
    "timestamp": "2025-01-15T09:00:01Z",
    "transport": "kafka",
    "payload_ref": {
        "topic": "Draco01",
        "partition": 0,
        "offset": 42,
        "message_key": "shot-000042",
        "path": "Z:/data/shot-000042.csv",
    },
    "values": {"energy_j": 8.2},
    "metadata": {"watch_name": "TPS results"},
}


def schema_text() -> str:
    """Deterministic JSON text of the canonical model's JSON schema."""
    return json.dumps(HZDREventV1.model_json_schema(), indent=2, sort_keys=True) + "\n"


def sample_text() -> str:
    """Deterministic JSON text of the canonical sample, validated first."""
    HZDREventV1.model_validate(SAMPLE_EVENT)
    return json.dumps(SAMPLE_EVENT, indent=2, sort_keys=True) + "\n"


def main() -> None:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    (FIXTURES_DIR / "hzdr-event-v1.schema.json").write_text(
        schema_text(), encoding="utf-8"
    )
    (FIXTURES_DIR / "hzdr-event-v1.sample.json").write_text(
        sample_text(), encoding="utf-8"
    )
    print(f"Wrote schema + sample fixtures to {FIXTURES_DIR}")
    print("Now copy both files into planet-watchdog/ and shotcounter/ fixtures.")


if __name__ == "__main__":
    main()
