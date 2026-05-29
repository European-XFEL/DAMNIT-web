"""Metadata routers."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from random import Random

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .._db.dependencies import DBSession
from .._mymdc.dependencies import MyMdCClient
from ..auth.dependencies import OAuthUserInfo, User
from ..shared.models import ProposalNumber
from ..shared.settings import settings
from . import services
from .hzdr_sources import (
    HZDRDatasetPreview,
    HZDRShot,
    HZDRShotDetail,
    HZDRSource,
    HZDRSourceProvider,
)
from .models import ProposalMeta

router = APIRouter(prefix="/metadata", tags=["metadata"])


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


@router.get("/hzdr/sources/{source_key}/shots/{shot_number}/datasets/{dataset_name:path}")
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
            detail="Shot status updates require local metadata provider and sources_file.",
        )
    return update_local_shot_status(
        settings.metadata.sources_file,
        source_key=source_key,
        shot_number=shot_number,
        status=payload.status,
        note=payload.note,
        reviewed_by=user.preferred_username or user.email,
    )


@router.post("/hzdr/emulator/events")
async def append_hzdr_emulator_event(payload: HZDREmulatorEvent) -> HZDRSource:
    """Append one local HZDR emulator shot to the local source fixture."""
    if settings.metadata.provider != "local" or settings.metadata.sources_file is None:
        raise HTTPException(
            status_code=400,
            detail="HZDR emulator events require local metadata provider and sources_file.",
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

    next_shot_number = max([int(shot.get("shot_number", 0)) for shot in shots] or [122]) + 1
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

    shots.append(
        {
            "source_key": source_record["key"],
            "shot_number": next_shot_number,
            "fired_at": fired_at,
            "hdf5_path": hdf5_path,
            "metadata": metadata,
        }
    )
    if isinstance(payload, dict):
        payload["sources"] = sources
        sources_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    else:
        sources_file.write_text(json.dumps(sources, indent=2), encoding="utf-8")

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
        history.append(
            {
                "at": metadata["reviewed_at"],
                "from": previous_status,
                "to": status,
                "by": reviewed_by,
                "note": metadata["review_note"],
            }
        )

    if isinstance(payload, dict):
        payload["sources"] = sources
        sources_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    else:
        sources_file.write_text(json.dumps(sources, indent=2), encoding="utf-8")

    return HZDRShot.model_validate(shot)


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

    file_payload = json.loads(sources_file.read_text(encoding="utf-8"))
    if isinstance(file_payload, dict):
        file_payload["sources"] = sources
        sources_file.write_text(json.dumps(file_payload, indent=2), encoding="utf-8")
    else:
        sources_file.write_text(json.dumps(sources, indent=2), encoding="utf-8")

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
    rng = Random(20260529 + index)
    return {
        "experiment_id": experiment_id,
        "shot_id": shot_id,
        "status": "processed" if index % 5 else "needs-review",
        "target": f"target-{(index % 4) + 1}",
        "combined_hdf5_path": hdf5_path,
        "emulated_sequence": index + 1,
        "emulated_source": event_source,
        "emulated_kind": event_kind,
        "laser_energy_j": round(12.4 + index * 0.17 + rng.uniform(-0.08, 0.08), 3),
        "chamber_pressure_mbar": round(2.5e-5 * (1 + index * 0.04 + rng.uniform(-0.01, 0.01)), 8),
        "xray_counts": int(1450 + index * 37 + rng.randint(-18, 18)),
        "sample_temperature_c": round(21.5 + index * 0.25 + rng.uniform(-0.05, 0.05), 2),
        "pulse_width_fs": round(42.0 + index * 0.35 + rng.uniform(-0.08, 0.08), 2),
        "beam_position_x_mm": round(-0.35 + index * 0.015 + rng.uniform(-0.003, 0.003), 4),
        "beam_position_y_mm": round(0.18 - index * 0.012 + rng.uniform(-0.003, 0.003), 4),
        "detector_signal_mean": round(2.25 + index * 0.22 + rng.uniform(-0.06, 0.06), 4),
        "alignment_score": round(0.82 + (index % 6) * 0.025 + rng.uniform(-0.01, 0.01), 4),
        "operator": ["alex", "sam", "lee"][index % 3],
    }


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
    event_path = events_dir / f"{event_source.lower().replace(' ', '-').replace('_', '-')}.jsonl"
    event = {
        "experiment_id": experiment_id,
        "shot_id": shot_id,
        "source": event_source,
        "kind": event_kind,
        "timestamp": fired_at,
        "transport": "flow-monitor",
        "payload_ref": {
            "source": "damnit-web-flow-monitor",
            "message_id": metadata["emulated_sequence"],
        },
        "values": [metadata["detector_signal_mean"]],
        "metadata": metadata,
    }
    with event_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
