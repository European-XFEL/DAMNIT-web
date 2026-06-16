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

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, JsonValue

HZDR_EVENT_SCHEMA_VERSION = "hzdr-event-v1"


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
    values: dict[str, JsonValue] | None = Field(
        default=None,
        description=(
            "Small structured scalar values only. Large datasets belong in "
            "payload_ref (uri/path/object-store/SciCat/Mongo reference), not here."
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
