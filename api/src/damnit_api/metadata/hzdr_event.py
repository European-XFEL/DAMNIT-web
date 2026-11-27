"""Canonical ``hzdr-event-v1`` envelope contract.

The authoritative copy of this file lives in DAMNIT-web-hzdr at
``api/src/damnit_api/metadata/hzdr_event.py`` (the shared event model is
described in that repo's ``docs/architecture.md``). There is no shared
Python package between the repos today, so the file is vendored
byte-identically into:

    planet-watchdog/watchdog_core/hzdr_event.py

by ``DAMNIT-web-hzdr/hzdr/scripts/sync-hzdr-event.ps1`` — edit only the
DAMNIT copy, then re-run the sync with ``-Apply``. planet-watchdog's shot
authority builds the ``draco.trigger`` events with this model. shotcounter's
parked Kafka publisher (``hzdrTangoDSShotcounter``, not deployed) builds a
plain-dict event of the same shape and vendors only the JSON fixtures.

Every transport event (LaserData/ASAPO, DAQ File Watchdog/Kafka,
DRACO-Trigger/Kafka, ...) must validate against ``HZDREventV1``. In DAMNIT,
``hzdr_sources.py`` and ``hzdr_nexus.py`` derive their event-shaped logic
from this model instead of maintaining independent field lists.
"""

from __future__ import annotations

import json
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, JsonValue

HZDR_EVENT_SCHEMA_VERSION = "hzdr-event-v1"

# The registered `experiment_id` sentinel (decision D1, 2026-09-29). A producer
# that does not know which campaign a shot belongs to sends exactly this value
# instead of guessing from its own configuration; `hzdr-event-v1` is unchanged
# (the field stays a required string). DAMNIT resolves the campaign at build
# time - LabFrog record, then campaign schedule, then a reviewer's ruling - and
# a shot none of them claims is still built, in the `_unassigned` bucket. It
# follows the existing `shot_id = "unassigned-<event_id>"` convention for a
# shot without an authoritative number.
UNASSIGNED_EXPERIMENT_ID = "unassigned"

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
    experiment_id: str = Field(
        description=(
            "Canonical campaign id. A producer that does not know the campaign "
            "sends the registered sentinel 'unassigned' (UNASSIGNED_EXPERIMENT_ID) "
            "rather than a guess; the consumer resolves it from LabFrog, the "
            "campaign schedule, or a reviewer's ruling."
        ),
    )
    shot_id: str
    # Strict: a JSON integer and nothing that merely converts to one. Lax
    # parsing turned `true` into shot 1 and `42.0` / "42.0" into shot 42, so a
    # producer bug became a different shot instead of a refusal. Ruled
    # 2026-09-30: whole numbers only.
    shot_number: Annotated[int, Field(strict=True, ge=0)] | None = Field(
        default=None,
        description=(
            "Issued only by the shot authority (planet-watchdog), which stamps "
            "every DRACO trigger. A whole number: a JSON integer >= 0, never a "
            "boolean, float or string. Null is valid and means this event "
            "carries no shot number, as for a file event not attributed to a "
            "shot. A producer's own counter belongs in metadata as "
            "provenance, never in this field."
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
    # "degC" (UDUNITS/pint) rather than "C", which unit-aware validators
    # parse as coulomb. Changed 2026-07-13 with NXhzdr_target profile 0.3.
    "target.temperature": "degC",
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
    # Laser pump-probe keys (registered 2026-11-27 with NXhzdr_target v0.11,
    # ruling R-2026-11-27b: "keys look OK for now"; change class
    # additive-metadata). Registered ahead of any producer; renaming one after
    # a producer emits it is a breaking change. They feed Part A's
    # temporal_contrast and the /pump_probe root entry (conforming to the
    # DAPHNE4NFDI NXlaser_pump_probe schema), which is written only for a
    # campaign with probe.delay. laser.contrast_time is how long before the
    # peak contrast_ratio was measured; probe.delay is positive when the probe
    # arrives after the pump. See hzdr/docs/plans/
    # plan-nxhzdr-target-v0.11-implementation.md.
    "laser.contrast_time": "ps",
    "laser.amplification_state": None,
    "probe.source": None,
    "probe.type": None,
    "probe.wavelength": "nm",
    "probe.delay": "ps",
    "probe.delay_set": "ps",
    "sync.scheme": None,
    "sync.delay_mechanism": None,
    "sync.time_zero": "ps",
    "sync.time_zero_method": None,
    "sync.time_zero_date": None,
    "vacuum.chamber_pressure": "mbar",
    "vacuum.pre_shot_pressure": "mbar",
    "vacuum.rga_dominant_species": None,
    # diagnostic.* per-shot QA scalars (registered 2026-07-18). Each key is one
    # detector-derived scalar per shot; the NeXus writer emits a shot-indexed
    # NXdetector series per key and stamps the unit below as `@units`. A new
    # diagnostic scalar must be registered here (and in the CLAUDE.md registry
    # table) before a producer emits it; an unregistered key is still written,
    # but unitless and flagged by lint_metadata_keys().
    "diagnostic.xray_counts": "counts",
    "diagnostic.detector_signal_mean": None,
    "diagnostic.alignment_score": None,
    # Thomson-parabola and dosimetry scalars (registered 2026-09-11). Named for
    # the geometry and the species because the number means nothing without
    # them: a 90-degree TPS reading for protons and for Si-11+ are different
    # measurements, not one key with a label. Sourced from the December 2025
    # ShootSheet columns "TPS 90 - H", "TPS 90 -Si 11" and "Dosis"
    # (shot-aligner); registered ahead of any producer, which is the order
    # this registry asks for. Observed ranges there: Si-11+ 10-58 MeV, dose
    # 0-317 uSv, protons a single 2.5 MeV setting.
    #
    # Since 2026-09-18 shot-aligner stamps all three onto its shot
    # containers from the ShootSheet columns they were registered from -- the
    # column names the species (`- H`, `-Si 11`), so nothing there is ambiguous,
    # and a cell holding an operator's words rather than a number keeps the key
    # but is marked as text. That is a NeXus field carrying a registry key, NOT
    # an event producer: nothing in that repository publishes to the pilot, and
    # standards-alignment.md 3.5 is still right that no producer sends the
    # Thomson parabola.
    #
    # The producer gap has a known cause rather than being an absence.
    # planet-watchdog's `simpleTPS_parser` reads the Thomson parabola's
    # own export and emits `estimated_Emax` in MeV -- the right quantity in the
    # right unit for one of the two keys below. Which one is not in the file: the
    # export carries the particle channel in its *name*
    # (`... Spektrum Particle__p.txt`) and not in its header, so a producer that
    # picked a key from the header alone would file Si-11+ spectra as protons.
    # That is exactly the confusion these two keys were split to prevent, so the
    # parser claims neither (parsers/simpleTPS_parser.json) and the gap stays
    # visible. Settling it needs an operator ruling on the file-name convention,
    # or an export that states the species.
    "diagnostic.tps90_proton_energy": "MeV",
    "diagnostic.tps90_si11_energy": "MeV",
    "diagnostic.radiation_dose": "uSv",
    # producer.* names the process that emitted the event (registered
    # 2026-08-31, bridge profile v3). Non-numeric identity, and the only
    # namespace the NeXus writer promotes to a canonical *column*
    # (/entry/source_events/producer_instance_id) rather than to a value: two
    # PLANET Watchdog PCs publishing the same `kind` and the same local
    # filename are only tellable apart from a projection rule if the instance
    # id has a path of its own. Absent instance id writes "" - it is
    # descriptive, never a join key (that is `event_id`).
    "producer.instance_id": None,
    "producer.host": None,
    # instrument.*, attribution.* and acquisition.* (registered 2026-09-29,
    # decision D2 of the automatic shot assembly plan, change class
    # additive-metadata: hzdr-event-v1 is unchanged). They say *which*
    # instrument wrote a file, *how* the producer tied it to a shot, and *when*
    # the data was taken. Registered ahead of any producer, which is the order
    # this registry asks for; once a producer emits them, renaming one is a
    # breaking change. `instrument.id` is the stable instrument-catalogue id
    # (null when unregistered) and is the one the NeXus writer promotes to a
    # column (/entry/source_events/instrument_id, bridge profile v4); the rest
    # stay in metadata_json for audit and review. The string enums are written
    # down in METADATA_KEY_VALUES below. `attribution.candidates` is a list of
    # shot numbers, `acquisition.time` an ISO-8601 UTC string, and
    # `attribution.delta_s` the one numeric key (first_seen - trigger receipt,
    # in seconds, audit only - DAMNIT never re-attributes from it).
    "instrument.id": None,
    "instrument.group": None,
    "instrument.timing_role": None,
    "instrument.format": None,
    "instrument.record_source": None,
    "attribution.method": None,
    "attribution.status": None,
    "attribution.delta_s": "s",
    "attribution.candidates": None,
    "acquisition.time": None,
    "acquisition.time_source": None,
    # LaserData's own row counter (registered 2026-10-03, maintainer ruling
    # 2026-10-02, change class additive-metadata). An integer, provenance only:
    # LaserData rows reach a shot through the shot authority, so this is never
    # a shot_number and never builds a shot_id. Named so it cannot be read as
    # one (aligner G8).
    "acquisition.laserdata_counter": None,
}


# The registry types `laser.polarization` as a string enum but, until
# 2026-07-27, never wrote the enum down - so "p", "P-pol" and "p_polarised"
# were all equally acceptable spellings of the same DRACO configuration.
# These are the accepted labels: the two plane-of-incidence conventions used
# at DRACO (`p`/`s`, facility-signed 2026-07-23, standards-alignment.md §3.3),
# their lab-frame equivalents, and the general polarization states NXbeam
# consumers expect. Matching is case-insensitive. The vocabulary is enforced
# up front on deployment config (HZDRLaserSettings) but only *warned* about
# for producer-supplied metadata, like every other registry check - see
# lint_metadata_keys().
LASER_POLARIZATION_VALUES: frozenset[str] = frozenset({
    "p",
    "s",
    "horizontal",
    "vertical",
    "linear",
    "circular",
    "circular_left",
    "circular_right",
    "elliptical",
    "unpolarized",
})


# Every registry key typed as a string enum, with its accepted labels. Matched
# case-insensitively and only *warned* about (lint_metadata_keys), never
# rejected - the same rule as laser.polarization, whose vocabulary predates this
# table. The instrument/attribution/acquisition enums were registered
# 2026-09-29 (decision D2); see the registry comment above.
METADATA_KEY_VALUES: dict[str, frozenset[str]] = {
    "laser.polarization": LASER_POLARIZATION_VALUES,
    "instrument.group": frozenset({"ions", "electrons"}),
    "instrument.timing_role": frozenset({"on_shot", "pre_shot"}),
    "instrument.record_source": frozenset({
        "catalogue",
        "catalogue+labfrog",
        "watch_rule",
        "none",
    }),
    "attribution.method": frozenset({
        "trigger_window",
        "filename_counter",
        "cadence",
        "manual",
    }),
    "attribution.status": frozenset({
        "attributed",
        "ambiguous",
        "no_trigger",
        "rescan",
        "unregistered",
    }),
    "acquisition.time_source": frozenset({"filename", "first_seen", "mtime", "none"}),
    # NXhzdr_target v0.11 (2026-11-27): the NXlaser_pump_probe and
    # NXsynchronization enumerations, so a matching label certifies as is.
    "laser.amplification_state": frozenset({"full", "reduced", "unamplified"}),
    "sync.scheme": frozenset({
        "common oscillator",
        "rf locked",
        "trigger only",
        "measured per event",
    }),
    "sync.delay_mechanism": frozenset({
        "optical delay line",
        "electronic phase shift",
        "bunch selection",
        "pulse picking",
        "trigger delay",
    }),
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
    # Pre-namespace flat spellings of the diagnostic.* scalars (registered
    # 2026-07-18). Unlike the suffixed keys above, the legacy name equals the
    # namespaced bare name, so lint_metadata_keys() skips the identity case
    # (metadata.diagnostic.xray_counts is canonical, not legacy).
    "xray_counts": "diagnostic.xray_counts",
    "detector_signal_mean": "diagnostic.detector_signal_mean",
    "alignment_score": "diagnostic.alignment_score",
}

# Namespace sub-objects exempt from legacy-key linting: the `properties`
# extras bag (docs/target-ontology.md §4) keeps `_unit`-suffix keys by
# design since it has no registry entry.
_LINT_EXEMPT_SUBOBJECTS = frozenset({"properties"})


def lint_metadata_keys(metadata: dict[str, Any]) -> list[str]:
    """Warn (never reject) about legacy, unregistered, or off-vocabulary keys.

    Pure/read-only: never mutates `metadata`, never raises. Checks top-level
    keys directly against LEGACY_KEY_MAP, and - one level down - each key of
    any nested namespace dict (e.g. `metadata["laser"]`, `metadata["vacuum"]`,
    `metadata["target"]`) except a sub-object literally named `properties`,
    which is exempt by design (see docs/target-ontology.md §4). A nested key
    whose namespaced path IS the canonical spelling (e.g.
    `diagnostic.xray_counts`, whose legacy flat spelling has the same bare
    name) is never flagged as legacy.

    Additionally warns about `metadata.diagnostic` keys with no
    `diagnostic.<key>` registry entry: the diagnostic namespace is
    registry-governed (registered 2026-07-18), so an unregistered scalar is
    written to the NeXus bridge without `@units` — register the key (code
    registry + CLAUDE.md table) before producing it.

    The *values* this linter looks at are the registry's string enums
    (METADATA_KEY_VALUES): `metadata.laser.polarization` (written down
    2026-07-27, an off-vocabulary label is written to
    `NXbeam.incident_polarization` verbatim) and, since 2026-09-29, the
    instrument/attribution/acquisition enums. An off-vocabulary label would
    otherwise silently fragment the vocabulary across producers.

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
            path = f"{key}.{inner_key}"
            if inner_key in LEGACY_KEY_MAP and LEGACY_KEY_MAP[inner_key] != path:
                warnings.append(
                    f"legacy metadata key '{path}' is superseded by "
                    f"'{LEGACY_KEY_MAP[inner_key]}' (bare key, canonical unit "
                    "in METADATA_KEY_REGISTRY)"
                )
            elif key == "diagnostic" and path not in METADATA_KEY_REGISTRY:
                warnings.append(
                    f"unregistered diagnostic metadata key '{path}': add it to "
                    "METADATA_KEY_REGISTRY (and the CLAUDE.md registry table) "
                    "so the NeXus writer can stamp @units"
                )
            elif path in METADATA_KEY_VALUES:
                warnings.extend(_lint_enum_value(path, value[inner_key]))
    return warnings


def _lint_enum_value(path: str, value: Any) -> list[str]:
    """Warn when a string-enum label is outside its registered vocabulary."""
    if value is None or not isinstance(value, str):
        return []
    vocabulary = METADATA_KEY_VALUES[path]
    if value.strip().lower() in vocabulary:
        return []
    accepted = ", ".join(sorted(vocabulary))
    consequence = (
        "it is written to NXbeam.incident_polarization verbatim"
        if path == "laser.polarization"
        else "it is kept in metadata_json verbatim"
    )
    warning = (
        f"metadata.{path} value {value!r} is outside the accepted "
        f"vocabulary ({accepted}); {consequence}"
    )
    return [warning]
