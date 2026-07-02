"""Canonical ``hzdr-event-v1`` envelope contract.

This is DAMNIT-web-hzdr's copy of the shared event model described in
``docs/architecture.md``. There is no shared Python package between this
repo and the producer repos today, so this file is vendored and must be kept
in sync by hand with:

    planet-watchdog/watchdog_core/hzdr_event.py

and with the shotcounter producer (``hzdrTangoDSShotcounter``), which builds
a plain-dict event of the same shape.

``hzdr_sources.py`` and ``hzdr_nexus.py`` derive their event-shaped logic
from this model instead of maintaining independent field lists.
"""

from __future__ import annotations

import json
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, JsonValue

HZDR_EVENT_SCHEMA_VERSION = "hzdr-event-v1"

# Guardrail for the inline ``values`` field. ``values`` is for small JSON
# scalars/objects/arrays only; large datasets belong behind a ``payload_ref``
# (uri/path/object-store/SciCat/Mongo reference), not embedded in the event
# envelope. These bounds keep staged events cheap to stage, match, and
# round-trip as JSON; a payload over either limit is a producer-side bug to fix
# at the source rather than something to silently accept. Counting is recursive
# so a nested array (e.g. an image) is measured by its total element count, not
# just its outer length.
MAX_VALUES_ITEMS = 4096
MAX_VALUES_BYTES = 64 * 1024


def _count_values_items(values: Any) -> int:
    """Count leaf items in a (possibly nested) ``values`` payload."""
    if isinstance(values, list):
        return sum(_count_values_items(item) for item in values)
    return 1


def check_values_size(
    values: Any,
    *,
    max_items: int = MAX_VALUES_ITEMS,
    max_bytes: int = MAX_VALUES_BYTES,
) -> str | None:
    """Return an actionable error string if ``values`` is too large, else None.

    Kept as a plain function (not a model validator) so both the file-loading
    path (``load_normalized_events``) and any future strict model validation can
    share one definition of "too large to embed".
    """
    if values is None:
        return None
    count = _count_values_items(values)
    if count > max_items:
        return (
            f"values has {count} items (limit {max_items}); move large arrays to "
            "payload_ref (uri/path/object-store reference)"
        )
    encoded = len(json.dumps(values, default=str).encode("utf-8"))
    if encoded > max_bytes:
        return (
            f"values is {encoded} bytes (limit {max_bytes}); move large data to "
            "payload_ref (uri/path/object-store reference)"
        )
    return None


class HZDRPayloadRef(BaseModel):
    """Canonical source traceability object for one ``hzdr-event-v1`` event.

    This is the field that must let a consumer replay or trace an event back
    to its source record - core traceability belongs here, not only in
    ``metadata``. Every field is optional because not every producer/transport
    has all of them, but at least one should be set for any real event.

    ``extra="allow"`` because existing producers already attach
    producer-specific refs at the top level (e.g. ``channel_id``, ``run_id``,
    ``record_id``, ``nexus_path``, ``filename``) rather than nesting them, and
    that shape predates this model.
    """

    model_config = ConfigDict(extra="allow")

    topic: str | None = None
    partition: int | None = None
    offset: int | None = None
    uri: str | None = None
    path: str | None = None
    message_key: str | None = None
    mongo_id: str | None = None
    scicat_pid: str | None = None


class HZDREventV1(BaseModel):
    """The canonical event envelope every transport event converges on.

    See ``docs/architecture.md`` for the authoritative description of this
    contract.
    """

    model_config = ConfigDict(extra="forbid")

    schema_version: Annotated[str, Field(pattern=r"^hzdr-event-v1$")] = (
        HZDR_EVENT_SCHEMA_VERSION
    )
    event_id: str
    experiment_id: str
    shot_id: str
    shot_number: int | None = Field(
        default=None,
        description=(
            "TANGO's shot counter is the authority. Null means no authoritative "
            "shot number is available yet for this event - this is expected, not "
            "an error, while labfrog/DRACO do not yet propagate one. Producers "
            "may still carry a non-authoritative nested/local counter, but only "
            "as provenance in metadata, never as this field."
        ),
    )
    source: str
    kind: str
    timestamp: str
    transport: str
    payload_ref: HZDRPayloadRef = Field(default_factory=HZDRPayloadRef)
    values: JsonValue | None = Field(
        default=None,
        description=(
            "Small JSON scalar, object, or array values only. Large datasets belong "
            "in payload_ref (uri/path/object-store/SciCat/Mongo reference), not here."
        ),
    )
    metadata: dict[str, JsonValue] = Field(
        default_factory=dict,
        description=(
            "Free-form extra detail, not a substitute for payload_ref traceability. "
            "Consumers that need a flat storage row (e.g. SQLite, NeXus attrs) are "
            "expected to serialize this whole object to one JSON-text column/dataset "
            "themselves; this model does not flatten it for them."
        ),
    )


# Keys an externally loaded normalized event file must carry. Kept as an
# explicit list rather than derived from HZDREventV1.model_fields, because
# several model fields are intentionally optional on a *loaded* record even
# though they are meaningful on the canonical model: event_id is synthesized
# by _normalize_event() when absent, and schema_version/shot_number/values/
# metadata all have model defaults and are only set by producers when known.
# payload_ref is the one field kept required here despite having a model
# default - the file contract always required the key (an empty object is
# fine; a missing key is not). See HZDREventV1 for the full field set.
EVENT_REQUIRED_FIELDS: frozenset[str] = frozenset({
    "experiment_id",
    "shot_id",
    "source",
    "kind",
    "timestamp",
    "transport",
    "payload_ref",
})


# Metadata key registry (binding, signed off 2026-07-02 — see CLAUDE.md
# "Metadata key registry" section, the authoritative human-readable copy of
# this table). Namespaced bare key ("namespace.key") -> canonical unit
# string, or None for a unitless/string key. The NeXus writer stamps the
# canonical unit as `@units` at write time; the value itself is always a
# bare number (no unit suffix in the key). The `properties` extras bag (see
# docs/target-ontology.md §4) is exempt from this registry - its keys keep
# the legacy `_unit` suffix convention since they have no registry entry.
METADATA_KEY_REGISTRY: dict[str, str | None] = {
    "target.thickness": "nm",
    "target.diameter": "mm",
    "target.temperature": "C",
    "target.gas_pressure": "bar",
    "laser.pulse_energy": "J",
    "laser.pulse_duration": "fs",
    "laser.wavelength": "nm",
    "laser.beam_pos_x": "mm",
    "laser.beam_pos_y": "mm",
    "laser.beam_waist_x": "um",
    "laser.beam_waist_y": "um",
    "laser.repetition_rate": "Hz",
    "laser.polarization": None,
    "laser.contrast_ratio": None,
    "laser.system": None,
    "vacuum.chamber_pressure": "mbar",
    "vacuum.pre_shot_pressure": "mbar",
    "vacuum.rga_dominant_species": None,
}


# Superseded flat/unit-suffixed key name -> new namespaced bare key (a
# METADATA_KEY_REGISTRY key). Producers must not use these for new events;
# they are recognized here only so lint_metadata_keys() can warn about them.
# Legacy keys are never rejected - only warned about - since the envelope
# stays open inside `metadata`.
LEGACY_KEY_MAP: dict[str, str] = {
    "laser_energy_j": "laser.pulse_energy",
    "pulse_energy_j": "laser.pulse_energy",
    "pulse_duration_fs": "laser.pulse_duration",
    "pulse_width_fs": "laser.pulse_duration",
    "wavelength_nm": "laser.wavelength",
    "beam_pos_x_mm": "laser.beam_pos_x",
    "beam_pos_y_mm": "laser.beam_pos_y",
    "beam_position_x_mm": "laser.beam_pos_x",
    "beam_position_y_mm": "laser.beam_pos_y",
    "beam_waist_x_um": "laser.beam_waist_x",
    "beam_waist_y_um": "laser.beam_waist_y",
    "repetition_rate_hz": "laser.repetition_rate",
    "chamber_pressure_mbar": "vacuum.chamber_pressure",
    "pre_shot_pressure_mbar": "vacuum.pre_shot_pressure",
    "sample_temperature_c": "target.temperature",
    "thickness_nm": "target.thickness",
    "diameter_mm": "target.diameter",
    "gas_pressure_bar": "target.gas_pressure",
}

# Namespace sub-objects exempt from legacy-key linting: the `properties`
# extras bag (docs/target-ontology.md §4) keeps `_unit`-suffix keys by
# design since it has no registry entry.
_LINT_EXEMPT_SUBOBJECTS = frozenset({"properties"})


def lint_metadata_keys(metadata: dict[str, Any]) -> list[str]:
    """Warn (never reject) about legacy suffixed metadata keys.

    Pure/read-only: never mutates `metadata`, never raises. Checks top-level
    keys directly against LEGACY_KEY_MAP, and - one level down - each key of
    any nested namespace dict (e.g. `metadata["laser"]`, `metadata["vacuum"]`,
    `metadata["target"]`) except a sub-object literally named `properties`,
    which is exempt by design (see docs/target-ontology.md §4).

    Returns a list of human-readable warning strings; does not log by itself
    (callers decide whether/how to log - see the call site in
    `hzdr_nexus._normalize_event`).
    """
    warnings: list[str] = []
    if not isinstance(metadata, dict):
        return warnings

    for key, value in metadata.items():
        if key in LEGACY_KEY_MAP:
            warnings.append(
                f"legacy metadata key '{key}' is superseded by "
                f"'{LEGACY_KEY_MAP[key]}' (bare key, canonical unit in "
                "METADATA_KEY_REGISTRY)"
            )
        if key in _LINT_EXEMPT_SUBOBJECTS or not isinstance(value, dict):
            continue
        for inner_key in value:
            if inner_key in LEGACY_KEY_MAP:
                path = f"{key}.{inner_key}"
                warnings.append(
                    f"legacy metadata key '{path}' is superseded by "
                    f"'{LEGACY_KEY_MAP[inner_key]}' (bare key, canonical unit "
                    "in METADATA_KEY_REGISTRY)"
                )
    return warnings
