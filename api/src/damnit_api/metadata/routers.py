"""Metadata routers."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from random import Random
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .._db.dependencies import DBSession
from .._mymdc.dependencies import MyMdCClient
from ..auth.dependencies import OAuthUserInfo, User
from ..shared.models import ProposalNumber
from ..shared.settings import settings
from . import services
from .hzdr_nexus import write_json_atomic
from .hzdr_sources import (
    HZDRDatasetPreview,
    HZDRMatchSummary,
    HZDRReviewEvent,
    HZDRShot,
    HZDRShotDetail,
    HZDRSource,
    HZDRSourceProvider,
)
from .models import ProposalMeta

router = APIRouter(prefix="/metadata", tags=["metadata"])

WATCHDOG_KAFKA_TOPIC = "planet.watchdog.events"
SHOTCOUNTER_KAFKA_TOPIC = "shotcounter.shots"
KAFKA_EVENT_SOURCES = {
    "planet-watchdog": (WATCHDOG_KAFKA_TOPIC, "planet-watchdog"),
}


class HZDREmulatorEvent(BaseModel):
    """One local flow-monitor emulator event request."""

    source: str = "PLANET-Watchdog"
    kind: str = "watchdog"
    source_key: str | None = None
    action: str = "append"


class HZDRShotStatusUpdate(BaseModel):
    """Operator status change for one local HZDR shot."""

    status: str
    note: str | None = None


class HZDRShotMetadataUpdate(BaseModel):
    """Operator correction for one local HZDR shot metadata value."""

    key: str
    value: Any
    note: str | None = None


class HZDRReviewResponse(BaseModel):
    """Events awaiting review plus the matched/ambiguous/unmatched summary."""

    match_summary: HZDRMatchSummary
    review_events: list[HZDRReviewEvent]


class HZDRConfirmMatchRequest(BaseModel):
    """Operator's chosen shot for one ambiguous event."""

    shot_key: str
    note: str | None = None


class HZDRDismissReviewEventRequest(BaseModel):
    """Operator acknowledgement for one unmatched event, with no shot attached."""

    note: str | None = None


@router.get("/proposal/{proposal_number}")
async def get_proposal_meta(
    proposal_number: ProposalNumber, mymdc: MyMdCClient, user: User, session: DBSession
) -> ProposalMeta:
    """Get proposal metadata by proposal number."""
    return await services.get_proposal_meta(mymdc, proposal_number, user, session)


@router.get("/hzdr/sources")
async def list_hzdr_sources() -> list[HZDRSource]:
    """List configured HZDR sources from the active local metadata provider."""
    return HZDRSourceProvider(settings.metadata).list_sources()


@router.get("/hzdr/sources/{source_key}")
async def get_hzdr_source(source_key: str) -> HZDRSource | None:
    """Get one HZDR source from the active local metadata provider."""
    return HZDRSourceProvider(settings.metadata).get_source(source_key)


@router.get("/hzdr/sources/{source_key}/shots")
async def list_hzdr_shots(source_key: str) -> list[HZDRShot]:
    """List shot records for one HZDR source."""
    return HZDRSourceProvider(settings.metadata).list_shots(source_key)


@router.get("/hzdr/sources/{source_key}/shots/{shot_number}")
async def get_hzdr_shot_detail(
    source_key: str, shot_number: int
) -> HZDRShotDetail | None:
    """Get one shot with basic HDF5 structure metadata."""
    return HZDRSourceProvider(settings.metadata).get_shot_detail(
        source_key, shot_number
    )


@router.get(
    "/hzdr/sources/{source_key}/shots/{shot_number}/datasets/{dataset_name:path}"
)
async def preview_hzdr_dataset(
    source_key: str, shot_number: int, dataset_name: str
) -> HZDRDatasetPreview | None:
    """Preview one HDF5 dataset for a selected HZDR shot."""
    return HZDRSourceProvider(settings.metadata).get_dataset_preview(
        source_key, shot_number, dataset_name
    )


@router.patch("/hzdr/sources/{source_key}/shots/{shot_number}/status")
async def update_hzdr_shot_status(
    source_key: str,
    shot_number: int,
    payload: HZDRShotStatusUpdate,
    user: OAuthUserInfo,
) -> HZDRShot:
    """Update local emulator shot review status."""
    if settings.metadata.provider != "local" or settings.metadata.sources_file is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Shot status updates require local metadata provider and sources_file."
            ),
        )
    return update_local_shot_status(
        settings.metadata.sources_file,
        source_key=source_key,
        shot_number=shot_number,
        status=payload.status,
        note=payload.note,
        reviewed_by=user.preferred_username or user.email,
    )


@router.patch("/hzdr/sources/{source_key}/shots/{shot_number}/metadata")
async def update_hzdr_shot_metadata(
    source_key: str,
    shot_number: int,
    payload: HZDRShotMetadataUpdate,
    user: OAuthUserInfo,
) -> HZDRShot:
    """Correct one metadata value in a local emulator shot."""
    if settings.metadata.provider != "local" or settings.metadata.sources_file is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Shot metadata corrections require local metadata provider and "
                "sources_file."
            ),
        )
    return update_local_shot_metadata(
        settings.metadata.sources_file,
        source_key=source_key,
        shot_number=shot_number,
        key=payload.key,
        value=payload.value,
        note=payload.note,
        corrected_by=user.preferred_username or user.email,
    )


@router.get("/hzdr/sources/{source_key}/review")
async def get_hzdr_review(source_key: str) -> HZDRReviewResponse:
    """Get ambiguous/unmatched events and the match-status summary for one source."""
    source = HZDRSourceProvider(settings.metadata).get_source(source_key)
    if source is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")
    return HZDRReviewResponse(
        match_summary=source.match_summary, review_events=source.review_events
    )


@router.post("/hzdr/sources/{source_key}/review/{event_id}/confirm")
async def confirm_hzdr_review_event(
    source_key: str,
    event_id: str,
    payload: HZDRConfirmMatchRequest,
    user: OAuthUserInfo,
) -> HZDRSource:
    """Attach an ambiguous event to one of its candidate shots."""
    if settings.metadata.provider != "local" or settings.metadata.sources_file is None:
        raise HTTPException(
            status_code=400,
            detail="Confirming matches requires local metadata provider and "
            "sources_file.",
        )
    return confirm_local_review_event(
        settings.metadata.sources_file,
        source_key=source_key,
        event_id=event_id,
        shot_key=payload.shot_key,
        note=payload.note,
        confirmed_by=user.preferred_username or user.email,
    )


@router.post("/hzdr/sources/{source_key}/review/{event_id}/dismiss")
async def dismiss_hzdr_review_event(
    source_key: str,
    event_id: str,
    payload: HZDRDismissReviewEventRequest,
    user: OAuthUserInfo,
) -> HZDRSource:
    """Acknowledge an unmatched event without attaching it to any shot."""
    if settings.metadata.provider != "local" or settings.metadata.sources_file is None:
        raise HTTPException(
            status_code=400,
            detail="Dismissing review events requires local metadata provider "
            "and sources_file.",
        )
    return dismiss_local_review_event(
        settings.metadata.sources_file,
        source_key=source_key,
        event_id=event_id,
        note=payload.note,
        dismissed_by=user.preferred_username or user.email,
    )


@router.post("/hzdr/emulator/events")
async def append_hzdr_emulator_event(
    payload: HZDREmulatorEvent, user: OAuthUserInfo
) -> HZDRSource:
    """Append one local HZDR emulator shot to the local source fixture."""
    if settings.metadata.provider != "local" or settings.metadata.sources_file is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "HZDR emulator events require local metadata provider and sources_file."
            ),
        )
    return append_emulated_shot(
        settings.metadata.sources_file,
        source_key=payload.source_key,
        event_source=payload.source,
        event_kind=payload.kind,
        action=payload.action,
    )


def append_emulated_shot(
    sources_file: Path,
    *,
    source_key: str | None,
    event_source: str,
    event_kind: str,
    action: str,
) -> HZDRSource:
    """Append a new shot to hzdr_sources.json and staged JSONL."""
    if not sources_file.exists():
        raise HTTPException(status_code=404, detail="HZDR sources file not found.")

    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    sources = payload.get("sources", payload if isinstance(payload, list) else [])
    if not sources:
        raise HTTPException(status_code=404, detail="No HZDR sources to append to.")

    source_record = next(
        (
            source
            for source in sources
            if source_key is None or source.get("key") == source_key
        ),
        None,
    )
    if source_record is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")

    shots = source_record.setdefault("shots", [])
    if action == "enrich" and shots:
        return enrich_latest_emulated_shot(
            source_record=source_record,
            sources_file=sources_file,
            sources=sources,
            shots=shots,
            event_source=event_source,
            event_kind=event_kind,
        )

    next_shot_number = (
        max([int(shot.get("shot_number", 0)) for shot in shots] or [122]) + 1
    )
    index = len(shots)
    experiment_id = str(
        source_record.get("metadata", {}).get("experiment_id", "exp-emulated")
    )
    hdf5_path = _source_hdf5_path(source_record)
    fired_at = (
        datetime(2026, 5, 22, 8, 30, 1, tzinfo=UTC) + timedelta(seconds=index)
    ).isoformat()
    shot_id = f"shot-{next_shot_number:06d}"
    metadata = _build_flow_monitor_metadata(
        index=index,
        shot_id=shot_id,
        experiment_id=experiment_id,
        hdf5_path=hdf5_path,
        event_source=event_source,
        event_kind=event_kind,
    )

    shots.append({
        "source_key": source_record["key"],
        "shot_number": next_shot_number,
        "fired_at": fired_at,
        "hdf5_path": hdf5_path,
        "metadata": metadata,
    })
    _write_sources_payload(sources_file, payload, sources)

    _append_staged_emulator_event(
        sources_file=sources_file,
        experiment_id=experiment_id,
        shot_id=shot_id,
        fired_at=fired_at,
        event_source=event_source,
        event_kind=event_kind,
        metadata=metadata,
    )

    return HZDRSource.model_validate(source_record)


def update_local_shot_status(
    sources_file: Path,
    *,
    source_key: str,
    shot_number: int,
    status: str,
    note: str | None,
    reviewed_by: str,
) -> HZDRShot:
    """Update shot review status in a local hzdr_sources.json fixture."""
    allowed_statuses = {"processed", "needs-review", "revision-needed"}
    if status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Unsupported shot status.")
    if not sources_file.exists():
        raise HTTPException(status_code=404, detail="HZDR sources file not found.")

    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    sources = payload.get("sources", payload if isinstance(payload, list) else [])
    source_record = next(
        (source for source in sources if source.get("key") == source_key),
        None,
    )
    if source_record is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")

    shot = next(
        (
            shot
            for shot in source_record.get("shots", [])
            if int(shot.get("shot_number", 0)) == shot_number
        ),
        None,
    )
    if shot is None:
        raise HTTPException(status_code=404, detail="HZDR shot not found.")

    metadata = shot.setdefault("metadata", {})
    previous_status = metadata.get("status")
    metadata["status"] = status
    metadata["reviewed_at"] = datetime.now(UTC).isoformat()
    metadata["reviewed_by"] = reviewed_by
    metadata["review_note"] = note or (
        "Marked OK" if status == "processed" else "Marked for revision"
    )
    history = metadata.setdefault("status_history", [])
    if isinstance(history, list):
        history.append({
            "at": metadata["reviewed_at"],
            "from": previous_status,
            "to": status,
            "by": reviewed_by,
            "note": metadata["review_note"],
        })

    _write_sources_payload(sources_file, payload, sources)

    return HZDRShot.model_validate(shot)


def update_local_shot_metadata(
    sources_file: Path,
    *,
    source_key: str,
    shot_number: int,
    key: str,
    value: Any,
    note: str | None,
    corrected_by: str,
) -> HZDRShot:
    """Correct one shot metadata field and retain an audit trail."""
    key = key.strip()
    reserved_keys = {
        "status",
        "status_history",
        "reviewed_at",
        "reviewed_by",
        "review_note",
        "metadata_correction_history",
        "shot_id",
        "experiment_id",
        "combined_hdf5_path",
    }
    if not key or key in reserved_keys:
        raise HTTPException(status_code=400, detail="Unsupported metadata key.")
    if not sources_file.exists():
        raise HTTPException(status_code=404, detail="HZDR sources file not found.")

    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    sources = payload.get("sources", payload if isinstance(payload, list) else [])
    source_record = next(
        (source for source in sources if source.get("key") == source_key),
        None,
    )
    if source_record is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")

    shot = next(
        (
            shot
            for shot in source_record.get("shots", [])
            if int(shot.get("shot_number", 0)) == shot_number
        ),
        None,
    )
    if shot is None:
        raise HTTPException(status_code=404, detail="HZDR shot not found.")

    metadata = shot.setdefault("metadata", {})
    previous_value = metadata.get(key)
    corrected_at = datetime.now(UTC).isoformat()
    metadata[key] = value
    history = metadata.setdefault("metadata_correction_history", [])
    if isinstance(history, list):
        history.append({
            "at": corrected_at,
            "key": key,
            "from": previous_value,
            "to": value,
            "by": corrected_by,
            "note": note or "Corrected from source table",
        })

    _write_sources_payload(sources_file, payload, sources)

    return HZDRShot.model_validate(shot)


def confirm_local_review_event(
    sources_file: Path,
    *,
    source_key: str,
    event_id: str,
    shot_key: str,
    note: str | None,
    confirmed_by: str,
) -> HZDRSource:
    """Attach an ambiguous review event to one of its candidate shots.

    This is a catalog-only edit, like update_local_shot_status above: it does not
    rewrite the canonical NeXus file, so the next real builder run (which
    recomputes review_events/match_summary from scratch) will undo it unless the
    underlying ambiguity is also resolved at the source (e.g. a duplicate LabFrog
    shot_number entry is corrected). Treat this as an operational triage tool for
    the catalog/API/frontend view, not a substitute for fixing root causes.
    """
    source_record, sources, payload = _load_source_record(sources_file, source_key)

    review_events = source_record.get("review_events", [])
    event = next(
        (event for event in review_events if event.get("event_id") == event_id), None
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Review event not found.")
    if event.get("match_status") != "ambiguous":
        raise HTTPException(
            status_code=400,
            detail="Only ambiguous events can be confirmed to a shot.",
        )
    candidate_shot_keys = event.get("candidate_shot_keys") or []
    if shot_key not in candidate_shot_keys:
        raise HTTPException(
            status_code=400,
            detail=(
                "shot_key must be one of the matcher's candidate shots for this "
                "event: " + ", ".join(candidate_shot_keys)
            ),
        )
    shot = next(
        (
            shot
            for shot in source_record.get("shots", [])
            if shot.get("shot_key") == shot_key
        ),
        None,
    )
    if shot is None:
        raise HTTPException(status_code=404, detail="Candidate shot not found.")

    confirmed_at = datetime.now(UTC).isoformat()
    attached_event = {
        key: value
        for key, value in event.items()
        if key not in {"match_status", "experiment_id", "candidate_shot_keys"}
    }
    attached_event["match_quality"] = "operator_confirmed"
    shot.setdefault("events", []).append(attached_event)
    shot["match_status"] = "matched"
    shot_metadata = shot.setdefault("metadata", {})
    history = shot_metadata.setdefault("match_confirmation_history", [])
    if isinstance(history, list):
        history.append({
            "at": confirmed_at,
            "event_id": event_id,
            "by": confirmed_by,
            "note": note or "Confirmed ambiguous match",
        })

    review_events.remove(event)
    source_record["review_events"] = review_events
    source_record["match_summary"] = _recompute_match_summary(source_record)

    _write_sources_payload(sources_file, payload, sources)
    return HZDRSource.model_validate(source_record)


def dismiss_local_review_event(
    sources_file: Path,
    *,
    source_key: str,
    event_id: str,
    note: str | None,
    dismissed_by: str,
) -> HZDRSource:
    """Acknowledge an unmatched review event without attaching it to any shot.

    The event stays in review_events (so there is still a record it exists and
    needs a real fix upstream) but is flagged acknowledged, and excluded from the
    unmatched count in match_summary so it stops nagging. Catalog-only edit, same
    caveat as confirm_local_review_event above re: surviving a rebuild.
    """
    source_record, sources, payload = _load_source_record(sources_file, source_key)

    review_events = source_record.get("review_events", [])
    event = next(
        (event for event in review_events if event.get("event_id") == event_id), None
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Review event not found.")
    if event.get("match_status") != "unmatched":
        raise HTTPException(
            status_code=400,
            detail="Only unmatched events can be dismissed without a shot.",
        )

    event["acknowledged"] = True
    event["acknowledged_at"] = datetime.now(UTC).isoformat()
    event["acknowledged_by"] = dismissed_by
    event["acknowledged_note"] = note or "Acknowledged with no shot attached"

    source_record["match_summary"] = _recompute_match_summary(source_record)

    _write_sources_payload(sources_file, payload, sources)
    return HZDRSource.model_validate(source_record)


def _load_source_record(
    sources_file: Path, source_key: str
) -> tuple[dict, list, dict | list]:
    """Read hzdr_sources.json and return the matching source record to mutate."""
    if not sources_file.exists():
        raise HTTPException(status_code=404, detail="HZDR sources file not found.")
    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    sources = payload.get("sources", payload if isinstance(payload, list) else [])
    source_record = next(
        (source for source in sources if source.get("key") == source_key),
        None,
    )
    if source_record is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")
    return source_record, sources, payload


def _write_sources_payload(
    sources_file: Path, payload: dict | list, sources: list
) -> None:
    """Persist hzdr_sources.json (derived catalog/review state) atomically."""
    if isinstance(payload, dict):
        payload["sources"] = sources
        write_json_atomic(sources_file, payload)
    else:
        write_json_atomic(sources_file, sources)


def _recompute_match_summary(source_record: dict) -> dict[str, int]:
    """Recompute matched/ambiguous/unmatched/confirmed/dismissed after a review action.

    Mirrors hzdr_nexus._build_match_summary's counting rules (matched = shots
    whose match_status is "matched", not just shot.get("events") truthiness -
    every shot also carries its own synthetic LabFrog event, so "events" is
    always non-empty and can't distinguish "labfrog-only" from "matched" - see
    that function's docstring for detail), but operates on the already
    serialized catalog dict instead of the builder's in-memory objects, and
    excludes acknowledged unmatched events from the unmatched count.

    confirmed counts events an operator attached via confirm_local_review_event
    (tagged match_quality="operator_confirmed" there); dismissed counts
    unmatched events an operator acknowledged via dismiss_local_review_event.
    Both are operator-review outcomes layered on top of the matcher's own
    output, and - like matched/ambiguous/unmatched - reset to 0 on the next
    catalog rebuild, since a rebuild recomputes this whole dict from scratch.
    """
    shots = source_record.get("shots", [])
    review_events = source_record.get("review_events", [])
    matched = sum(1 for shot in shots if shot.get("match_status") == "matched")
    ambiguous = sum(
        1 for event in review_events if event.get("match_status") == "ambiguous"
    )
    unmatched = sum(
        1
        for event in review_events
        if event.get("match_status") == "unmatched" and not event.get("acknowledged")
    )
    confirmed = sum(
        1
        for shot in shots
        for event in shot.get("events", [])
        if event.get("match_quality") == "operator_confirmed"
    )
    dismissed = sum(
        1
        for event in review_events
        if event.get("match_status") == "unmatched" and event.get("acknowledged")
    )
    return {
        "matched": matched,
        "ambiguous": ambiguous,
        "unmatched": unmatched,
        "confirmed": confirmed,
        "dismissed": dismissed,
    }


def enrich_latest_emulated_shot(
    *,
    source_record: dict,
    sources_file: Path,
    sources: list,
    shots: list,
    event_source: str,
    event_kind: str,
) -> HZDRSource:
    """Add transport metadata to the latest shot without advancing shot number."""
    shot = shots[-1]
    metadata = shot.setdefault("metadata", {})
    enrich_count = int(metadata.get("emulated_enrich_count", 0)) + 1
    metadata["emulated_enrich_count"] = enrich_count
    metadata["emulated_last_enrichment_source"] = event_source
    metadata["emulated_last_enrichment_kind"] = event_kind
    metadata["detector_signal_mean"] = round(
        float(metadata.get("detector_signal_mean", 2.25)) + 0.11,
        4,
    )
    metadata["laser_energy_j"] = round(
        float(metadata.get("laser_energy_j", 12.4)) + 0.03,
        3,
    )
    _apply_event_source_metadata(
        metadata,
        event_source=event_source,
        event_kind=event_kind,
        sequence=enrich_count,
    )

    file_payload = json.loads(sources_file.read_text(encoding="utf-8"))
    _write_sources_payload(sources_file, file_payload, sources)

    _append_staged_emulator_event(
        sources_file=sources_file,
        experiment_id=str(metadata.get("experiment_id", "exp-emulated")),
        shot_id=str(metadata.get("shot_id", f"shot-{shot.get('shot_number', 0):06d}")),
        fired_at=str(shot.get("fired_at", "")),
        event_source=event_source,
        event_kind=event_kind,
        metadata=metadata,
    )

    return HZDRSource.model_validate(source_record)


def _source_hdf5_path(source_record: dict) -> str | None:
    """Return the source HDF5 path as a string if one is configured."""
    metadata_path = source_record.get("metadata", {}).get("combined_hdf5_path")
    if metadata_path:
        return str(metadata_path)
    data_paths = source_record.get("data_paths") or []
    return str(data_paths[0]) if data_paths else None


def _build_flow_monitor_metadata(
    *,
    index: int,
    shot_id: str,
    experiment_id: str,
    hdf5_path: str | None,
    event_source: str,
    event_kind: str,
) -> dict:
    """Create varied metadata for a flow-monitor generated shot."""
    rng = Random(20260529 + index)  # noqa: S311 - deterministic emulator data.
    metadata = {
        "experiment_id": experiment_id,
        "shot_id": shot_id,
        "status": "processed" if index % 5 else "needs-review",
        "target": f"target-{(index % 4) + 1}",
        "combined_hdf5_path": hdf5_path,
        "emulated_sequence": index + 1,
        "emulated_source": event_source,
        "emulated_kind": event_kind,
        "laser_energy_j": round(12.4 + index * 0.17 + rng.uniform(-0.08, 0.08), 3),
        "chamber_pressure_mbar": round(
            2.5e-5 * (1 + index * 0.04 + rng.uniform(-0.01, 0.01)), 8
        ),
        "xray_counts": int(1450 + index * 37 + rng.randint(-18, 18)),
        "sample_temperature_c": round(
            21.5 + index * 0.25 + rng.uniform(-0.05, 0.05), 2
        ),
        "pulse_width_fs": round(42.0 + index * 0.35 + rng.uniform(-0.08, 0.08), 2),
        "beam_position_x_mm": round(
            -0.35 + index * 0.015 + rng.uniform(-0.003, 0.003), 4
        ),
        "beam_position_y_mm": round(
            0.18 - index * 0.012 + rng.uniform(-0.003, 0.003), 4
        ),
        "detector_signal_mean": round(
            2.25 + index * 0.22 + rng.uniform(-0.06, 0.06), 4
        ),
        "alignment_score": round(
            0.82 + (index % 6) * 0.025 + rng.uniform(-0.01, 0.01), 4
        ),
        "operator": ["alex", "sam", "lee"][index % 3],
    }
    _apply_event_source_metadata(
        metadata,
        event_source=event_source,
        event_kind=event_kind,
        sequence=index + 1,
    )
    return metadata


def _apply_event_source_metadata(
    metadata: dict, *, event_source: str, event_kind: str, sequence: int
) -> None:
    """Add source-specific enrichment fields used by the local flow monitor."""
    source = _event_file_stem(event_source)
    if source == "planet-watchdog":
        metadata["watchdog_event_count"] = _next_metadata_counter(
            metadata, "watchdog_event_count"
        )
        metadata["watchdog_last_kind"] = event_kind
        metadata["watchdog_status"] = "shot-event-seen"
        return
    if source == "shotcounter":
        metadata["shotcounter_event_count"] = _next_metadata_counter(
            metadata, "shotcounter_event_count"
        )
        metadata["shotcounter_status"] = "shot-opened"
        metadata["shotcounter_last_kind"] = event_kind


def _next_metadata_counter(metadata: dict, key: str) -> int:
    """Increment a metadata counter that may have come from a hand-written file."""
    try:
        current = int(metadata.get(key, 0))
    except (TypeError, ValueError):
        current = 0
    return current + 1


def _append_staged_emulator_event(
    *,
    sources_file: Path,
    experiment_id: str,
    shot_id: str,
    fired_at: str,
    event_source: str,
    event_kind: str,
    metadata: dict,
) -> None:
    """Append one production-shaped JSONL event for the flow monitor."""
    events_dir = sources_file.parent / "events"
    events_dir.mkdir(parents=True, exist_ok=True)
    event_path = events_dir / f"{_event_file_stem(event_source)}.jsonl"
    event = {
        "experiment_id": experiment_id,
        "shot_id": shot_id,
        "source": event_source,
        "kind": event_kind,
        "timestamp": fired_at,
        "transport": _transport_for_event_source(event_source),
        "payload_ref": _payload_ref_for_event_source(event_source, metadata),
        "values": _values_for_event_source(event_source, metadata),
        "metadata": metadata,
    }
    with event_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")


def _event_file_stem(event_source: str) -> str:
    """Return the staged JSONL stem for one event source."""
    return event_source.lower().replace(" ", "-").replace("_", "-")


def _transport_for_event_source(event_source: str) -> str:
    """Mirror the production transport used by well-known HZDR sources."""
    source = _event_file_stem(event_source)
    if source == "shotcounter":
        return "zmq+kafka"
    if source in KAFKA_EVENT_SOURCES:
        return "kafka"
    if source == "laserdata":
        return "asapo"
    return "flow-monitor"


def _payload_ref_for_event_source(
    event_source: str, metadata: dict
) -> dict[str, str | int]:
    """Build the staged payload reference for a flow-monitor event."""
    message_id = _emulated_message_id(metadata)
    source = _event_file_stem(event_source)
    kafka_source = KAFKA_EVENT_SOURCES.get(source)
    if kafka_source:
        topic, producer = kafka_source
        return {
            "topic": topic,
            "partition": 0,
            "offset": message_id,
            "producer": producer,
        }
    if source == "shotcounter":
        return {
            "endpoint": "shotcounter-zmq",
            "topic": SHOTCOUNTER_KAFKA_TOPIC,
            "partition": 0,
            "offset": message_id,
            "producer": "shotcounter",
        }
    if source == "laserdata":
        return {
            "endpoint": "local-asapo-broker",
            "beamtime": str(metadata.get("experiment_id", "exp-emulated")),
            "data_source": "hzdr-damnit",
            "stream": "laser",
            "message_id": message_id,
        }
    return {
        "source": "damnit-web-flow-monitor",
        "message_id": message_id,
    }


def _values_for_event_source(event_source: str, metadata: dict) -> list[float]:
    """Return representative signal values for one staged flow-monitor event."""
    return [float(metadata.get("detector_signal_mean", 0.0))]


def _emulated_message_id(metadata: dict) -> int:
    """Return a stable message id even for hand-written source fixtures."""
    value = metadata.get("emulated_sequence", metadata.get("emulated_enrich_count", 1))
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1
