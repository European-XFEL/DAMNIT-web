"""HZDR metadata routers (fork-only).

The HZDR-specific REST surface — sources, campaigns, shots, saved views, the
operator review/confirm/dismiss flow, SciCat/wiki links, and the local
flow-monitor emulator — split out of ``routers.py`` so the upstream metadata
router stays small.  Mounted from ``main.py`` alongside ``metadata.router``;
paths are unchanged (``/metadata/hzdr/*``).
"""

import hashlib
import json
import logging
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from random import Random
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth.dependencies import OAuthUserInfo
from ..consumer.builder_trigger import request_rebuild
from ..shared.hzdr_settings import HZDRWikiSettings
from ..shared.settings import settings
from .hzdr_event import UNASSIGNED_EXPERIMENT_ID, HZDREventV1
from .hzdr_nexus import (
    REVIEW_LEVELS,
    append_experiment_ruling,
    append_review_decision,
    load_experiment_ruling_records,
    review_sidecar_path,
    write_json_atomic,
)
from .hzdr_sources import (
    HZDRDatasetPreview,
    HZDRMatchSummary,
    HZDRReviewEvent,
    HZDRScicatInfo,
    HZDRShot,
    HZDRShotDetail,
    HZDRSource,
    HZDRSourceProvider,
    HZDRWikiInfo,
)
from .labfrog_sqlite import (
    LabFrogCampaignRef,
    LabFrogCampaignShot,
    list_campaign_shots,
    list_campaigns,
)
from .producer_status import HZDRProducerStatus, derive_producer_status

hzdr_router = APIRouter(prefix="/metadata", tags=["metadata"])
log = logging.getLogger(__name__)

# The two pilot topics, as kafka-broker-docker's topics.env names them.
WATCHDOG_KAFKA_TOPIC = "planet.watchdog.events"
DRACO_TRIGGER_KAFKA_TOPIC = "draco.trigger"

# The flow-monitor emulator writes the envelopes the real producers send
# (flow mesh plan M9), so the demo shows the pipeline that is deployed:
#
# - a trigger is the shot authority's: planet-watchdog's
#   ``shot_authority.trigger_event`` (source ``DRACO-Trigger``, kind
#   ``trigger.threshold_crossing``, ``experiment_id: "unassigned"``, the
#   number in ``shot_number``). ``Shotcounter`` is still accepted as the
#   request's source name and means the same trigger: the device feeds the
#   authority, it issues no shot number itself.
# - a file event is a DAQ File Watchdog's (``kafka_output``): attributed to
#   the shot, also ``unassigned``, with the registered ``instrument.*``,
#   ``attribution.*``, ``acquisition.*`` and ``producer.*`` metadata.
#
# The emulator stands in for the authority (it issues the next number) and
# for the builder's campaign resolution (the shot lands in the campaign
# selected in the monitor, recorded as ``experiment_id_source: "schedule"``).
TRIGGER_SOURCE = "DRACO-Trigger"
TRIGGER_KIND = "trigger.threshold_crossing"
WATCHDOG_SOURCE = "DAQ-File-Watchdog"
_TRIGGER_SOURCE_STEMS = frozenset({"draco-trigger", "shotcounter"})
_WATCHDOG_SOURCE_STEMS = frozenset({"daq-file-watchdog"})
EMULATED_AUTHORITY_ID = "emulated-shot-authority"
EMULATED_TRIGGER_CHANNEL = "Draco01"
# One watch rule on one instrument PC: the Ions PC and an instrument of the
# reference fixture (api/tests/fixtures/hzdr-reference), so the emulated
# event reads like the first PC the rollout plans to install.
EMULATED_WATCH_NAME = "M1_Spec_Fib_Cer"
EMULATED_INSTRUMENT = {
    "id": "m1_spec_fib_cer",
    "group": "ions",
    "timing_role": "on_shot",
    "format": "camera_png_csv",
    "record_source": "catalogue",
}
EMULATED_PRODUCER = {
    "instance_id": "watchdog-ions-01",
    "host": "daq-watchdog-ions",
}
EMULATED_ATTRIBUTION_DELTA_S = 1.4


class HZDREmulatorEvent(BaseModel):
    """One local flow-monitor emulator event request."""

    source: str = "DAQ-File-Watchdog"
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


class HZDRSavedViewCreate(BaseModel):
    """Create or replace a personal HZDR table view."""

    name: str
    kind: str = "table"
    scope: str = "personal"
    state: dict[str, Any] = Field(default_factory=dict)


class HZDRSavedView(BaseModel):
    """One durable HZDR UI view sidecar record."""

    id: str
    source_key: str
    name: str
    kind: str = "table"
    scope: str = "personal"
    owner: str
    state: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str


class HZDRExperimentRuling(BaseModel):
    """A recorded campaign ruling for one shot number, waiting for a rebuild."""

    shot_number: int
    experiment_id: str
    by: str | None = None
    at: str | None = None
    note: str | None = None
    review_level: str | None = None


class HZDRReviewResponse(BaseModel):
    """Everything in one source that waits for a person.

    ``review_events`` are the ambiguous/unmatched events; ``unassigned_shots``
    are shots no LabFrog record, schedule window or ruling placed in a campaign
    (``experiment_id_source == "unassigned"``); ``experiment_rulings`` are the
    rulings already recorded for those shots, which apply at the next rebuild.
    """

    match_summary: HZDRMatchSummary
    review_events: list[HZDRReviewEvent]
    unassigned_shots: list[HZDRShot] = Field(default_factory=list)
    experiment_rulings: list[HZDRExperimentRuling] = Field(default_factory=list)


class HZDRConfirmMatchRequest(BaseModel):
    """Operator's chosen shot for one ambiguous event."""

    shot_key: str
    note: str | None = None
    review_level: str = "REVIEWED"


class HZDRDismissReviewEventRequest(BaseModel):
    """Operator acknowledgement for one unmatched event, with no shot attached."""

    note: str | None = None
    review_level: str = "REVIEWED"


class HZDRAssignExperimentRequest(BaseModel):
    """Reviewer assignment for a shot the producer left unassigned."""

    shot_number: int = Field(strict=True, gt=0)
    experiment_id: str = Field(min_length=1)
    note: str | None = None
    review_level: str = "REVIEWED"


@hzdr_router.get("/hzdr/sources")
async def list_hzdr_sources() -> list[HZDRSource]:
    """List configured HZDR sources from the active local metadata provider."""
    return HZDRSourceProvider(settings.metadata).list_sources()


@hzdr_router.get("/hzdr/campaigns")
async def list_hzdr_campaigns() -> list[LabFrogCampaignRef]:
    """List curated LabFrog campaigns discovered in the configured directory.

    Reads the per-campaign SQLite snapshots produced by labfrog-sqlite-tools
    (DW_API_METADATA__LABFROG_CURATED_DIR). Returns [] when unconfigured.
    """
    return list_campaigns(settings.metadata.labfrog_curated_dir)


@hzdr_router.get("/hzdr/campaigns/{campaign_key}/shots")
async def list_hzdr_campaign_shots(
    campaign_key: str,
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[LabFrogCampaignShot]:
    """Preview shot records for one curated campaign from its SQLite snapshot."""
    return list_campaign_shots(
        settings.metadata.labfrog_curated_dir, campaign_key, limit=limit
    )


@hzdr_router.get("/hzdr/sources/{source_key}")
async def get_hzdr_source(source_key: str) -> HZDRSource | None:
    """Get one HZDR source from the active local metadata provider."""
    return HZDRSourceProvider(settings.metadata).get_source(source_key)


@hzdr_router.get("/hzdr/sources/{source_key}/producer-status")
async def get_hzdr_producer_status(source_key: str) -> HZDRProducerStatus:
    """Derive DAQ File Watchdog hosts + Shotcounter status from catalog events."""
    source = HZDRSourceProvider(settings.metadata).get_source(source_key)
    if source is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")
    return derive_producer_status(source)


@hzdr_router.get("/hzdr/sources/{source_key}/scicat")
async def get_hzdr_source_scicat(source_key: str) -> HZDRScicatInfo:
    """Return the SciCat dataset link for one campaign source.

    ``configured`` reflects DW_API_HZDR_SCICAT__ENABLED; ``registered`` is true
    once the builder's SciCat post-step has stored a ``scicat_pid`` in the
    catalog. ``dataset_url`` is a clickable link to the SciCat frontend when
    DW_API_HZDR_SCICAT__FRONTEND_URL is set (or the builder stored one already).
    Safe when SciCat is not configured: returns configured=false, registered=false.
    """
    source = HZDRSourceProvider(settings.metadata).get_source(source_key)
    if source is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")

    metadata = source.metadata
    pid = _metadata_string(metadata, "scicat_pid")
    dataset_url = _metadata_string(metadata, "scicat_dataset_url")
    if dataset_url is None and pid is not None:
        frontend = settings.hzdr_scicat.frontend_url.rstrip("/")
        if frontend:
            dataset_url = f"{frontend}/datasets/{quote(pid, safe='')}"
    return HZDRScicatInfo(
        source_key=source_key,
        experiment_id=_metadata_string(metadata, "experiment_id"),
        configured=settings.hzdr_scicat.enabled,
        registered=pid is not None,
        pid=pid,
        dataset_url=dataset_url,
        version_hash=_metadata_string(metadata, "scicat_version_hash"),
        registered_at=_metadata_string(metadata, "scicat_registered_at"),
    )


@hzdr_router.get("/hzdr/sources/{source_key}/wiki")
async def get_hzdr_source_wiki(
    source_key: str,
    fetch: bool = Query(
        default=False,
        description=(
            "When true, make a live request to the MediaWiki Action API and "
            "populate exists/last_modified/page_id/categories. "
            "On network failure the live fields are returned as null."
        ),
    ),
) -> HZDRWikiInfo:
    """Return the MediaWiki link for one campaign source.

    The page URL is derived from source metadata and the configured
    DW_API_HZDR_WIKI__BASE_URL. An explicit ``metadata.wiki_page_title`` is
    treated as the full MediaWiki title. Otherwise, when
    DW_API_HZDR_WIKI__NAMESPACE is set (e.g. ``FWKT``) and the experiment_id
    carries no namespace prefix, the page title becomes
    ``{namespace}:{experiment_id}``. Campaign pages on the real FWK wiki live in
    the ``FWKT:`` namespace while ``experiment_id`` is the bare slug. The
    derived URL uses the robust query form ``{base}/index.php?title={title}``
    with the title percent-encoded; an explicit ``metadata.wiki_page_url`` on
    the source always wins unchanged. When the base URL is not configured, the
    derived page_url is null and configured=false - safe for offline/local
    environments.

    Use fetch=true to get live page metadata (exists, last_modified, categories)
    from the MediaWiki Action API.
    """
    source = HZDRSourceProvider(settings.metadata).get_source(source_key)
    if source is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")

    wiki = settings.hzdr_wiki
    experiment_id = _metadata_string(source.metadata, "experiment_id")
    page_title = _wiki_page_title(
        source_key=source_key,
        metadata=source.metadata,
        experiment_id=experiment_id,
        namespace=wiki.namespace,
    )
    configured_url = _metadata_string(source.metadata, "wiki_page_url")

    if not wiki.base_url:
        return HZDRWikiInfo(
            source_key=source_key,
            experiment_id=experiment_id,
            page_title=page_title,
            page_url=configured_url,
            configured=False,
        )

    base = wiki.base_url.rstrip("/")
    page_url = configured_url or _wiki_page_url(base, page_title)
    info = HZDRWikiInfo(
        source_key=source_key,
        experiment_id=experiment_id,
        page_title=page_title,
        page_url=page_url,
        configured=True,
    )

    if fetch:
        info = await _fetch_wiki_page_info(info, base, wiki.fetch_timeout, wiki)

    return info


def _metadata_string(metadata: dict[str, Any], key: str) -> str | None:
    value = metadata.get(key)
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _wiki_page_title(
    *,
    source_key: str,
    metadata: dict[str, Any],
    experiment_id: str | None,
    namespace: str,
) -> str:
    explicit_title = _metadata_string(metadata, "wiki_page_title")
    if explicit_title:
        return explicit_title

    page_title = experiment_id or source_key
    namespace = namespace.strip().strip(":")
    if namespace and ":" not in page_title:
        return f"{namespace}:{page_title}"
    return page_title


def _wiki_page_url(wiki_base: str, page_title: str) -> str:
    # Query form + percent-encoding: real titles contain "%", commas and dots
    # (e.g. Ionen:1,1%Formvar062022); the namespace colon stays readable.
    return f"{wiki_base}/index.php?title={quote(page_title, safe=':')}"


def _wiki_auth_headers(wiki_settings: HZDRWikiSettings | None) -> dict[str, str]:
    if wiki_settings is None:
        return {}

    headers: dict[str, str] = {}
    cookie = wiki_settings.cookie_header.get_secret_value().strip()
    if cookie:
        headers["Cookie"] = cookie
    authorization = wiki_settings.authorization_header.get_secret_value().strip()
    if authorization:
        headers["Authorization"] = authorization
    return headers


async def _fetch_wiki_page_info(
    info: HZDRWikiInfo,
    wiki_base: str,
    request_timeout: float,
    wiki_settings: HZDRWikiSettings | None = None,
) -> HZDRWikiInfo:
    """Query the MediaWiki Action API for page existence and metadata.

    Returns the same info object with live fields populated.  On any network
    or parse error, logs a warning and returns the info unchanged so the caller
    always gets a valid response.
    """
    api_url = f"{wiki_base}/api.php"
    params = {
        "action": "query",
        "prop": "info|categories",
        "titles": info.page_title,
        "format": "json",
        "redirects": "1",
        "cllimit": "20",
    }
    try:
        async with httpx.AsyncClient(
            timeout=request_timeout, headers=_wiki_auth_headers(wiki_settings)
        ) as client:
            resp = await client.get(api_url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        log.warning("MediaWiki API fetch failed for %r: %s", info.page_title, exc)
        return info

    try:
        pages = (data.get("query") or {}).get("pages") or {}
        if not isinstance(pages, dict) or not pages:
            return info

        page = next(iter(pages.values()))
        if not isinstance(page, dict):
            return info

        info.page_id = page.get("pageid")
        info.exists = "missing" not in page
        info.last_modified = page.get("touched")
        categories = page.get("categories") or []
        if isinstance(categories, list):
            info.categories = [
                cat.get("title", "").removeprefix("Category:")
                for cat in categories
                if isinstance(cat, dict)
            ]
    except (AttributeError, TypeError, StopIteration) as exc:
        log.warning(
            "MediaWiki API response could not be parsed for %r: %s",
            info.page_title,
            exc,
        )
    return info


def hzdr_saved_views_sidecar_path(sources_file: Path) -> Path:
    return sources_file.with_name(f"{sources_file.stem}.views.json")


def _current_view_owner(user: OAuthUserInfo) -> str:
    return user.preferred_username or getattr(user, "sub", "") or user.email


def _saved_view_id() -> str:
    return "view_" + secrets.token_urlsafe(12).replace("-", "_")


def _require_local_hzdr_view_store() -> Path:
    if settings.metadata.provider != "local" or settings.metadata.sources_file is None:
        raise HTTPException(
            status_code=400,
            detail="HZDR saved views require local metadata provider and sources_file.",
        )
    return hzdr_saved_views_sidecar_path(settings.metadata.sources_file)


def load_hzdr_saved_views(path: Path) -> list[HZDRSavedView]:
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Invalid saved views sidecar: {path}"
        ) from exc
    records = payload.get("views", []) if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise HTTPException(
            status_code=500, detail=f"Invalid saved views sidecar: {path}"
        )
    return [
        HZDRSavedView.model_validate(record)
        for record in records
        if isinstance(record, dict)
    ]


def write_hzdr_saved_views(path: Path, views: list[HZDRSavedView]) -> None:
    write_json_atomic(
        path, {"version": 1, "views": [view.model_dump() for view in views]}
    )


@hzdr_router.get("/hzdr/sources/{source_key}/views")
async def list_hzdr_saved_views(
    source_key: str, user: OAuthUserInfo
) -> list[HZDRSavedView]:
    """List this user's personal HZDR table views plus reserved shared views."""
    source = HZDRSourceProvider(settings.metadata).get_source(source_key)
    if source is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")
    owner = _current_view_owner(user)
    views = load_hzdr_saved_views(_require_local_hzdr_view_store())
    return [
        view
        for view in views
        if view.source_key == source_key
        and (view.scope == "shared" or view.owner == owner)
    ]


@hzdr_router.post("/hzdr/sources/{source_key}/views")
async def save_hzdr_saved_view(
    source_key: str, payload: HZDRSavedViewCreate, user: OAuthUserInfo
) -> HZDRSavedView:
    """Create or replace this user's personal HZDR table view."""
    source = HZDRSourceProvider(settings.metadata).get_source(source_key)
    if source is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")
    if payload.scope != "personal":
        raise HTTPException(
            status_code=400, detail="Only personal saved views are supported."
        )
    owner = _current_view_owner(user)
    path = _require_local_hzdr_view_store()
    views = load_hzdr_saved_views(path)
    existing = {
        (view.source_key, view.owner, view.kind, view.name): view for view in views
    }
    key = (source_key, owner, payload.kind, payload.name)
    previous = existing.get(key)
    now = datetime.now(UTC).isoformat()
    saved = HZDRSavedView(
        id=previous.id if previous else _saved_view_id(),
        source_key=source_key,
        name=payload.name,
        kind=payload.kind,
        scope="personal",
        owner=owner,
        state=payload.state,
        created_at=previous.created_at if previous else now,
        updated_at=now,
    )
    existing[key] = saved
    write_hzdr_saved_views(path, list(existing.values()))
    return saved


@hzdr_router.delete("/hzdr/sources/{source_key}/views/{view_id}")
async def delete_hzdr_saved_view(
    source_key: str, view_id: str, user: OAuthUserInfo
) -> dict[str, bool]:
    """Delete one of this user's personal HZDR table views."""
    source = HZDRSourceProvider(settings.metadata).get_source(source_key)
    if source is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")
    owner = _current_view_owner(user)
    path = _require_local_hzdr_view_store()
    views = load_hzdr_saved_views(path)
    kept: list[HZDRSavedView] = []
    deleted = False
    for view in views:
        if view.source_key == source_key and view.id == view_id:
            if view.owner != owner or view.scope != "personal":
                raise HTTPException(
                    status_code=403, detail="Cannot delete this saved view."
                )
            deleted = True
            continue
        kept.append(view)
    if deleted:
        write_hzdr_saved_views(path, kept)
    return {"deleted": deleted}


@hzdr_router.get("/hzdr/sources/{source_key}/shots")
async def list_hzdr_shots(source_key: str) -> list[HZDRShot]:
    """List shot records for one HZDR source."""
    return HZDRSourceProvider(settings.metadata).list_shots(source_key)


@hzdr_router.get("/hzdr/sources/{source_key}/shots/by-key/{shot_key}")
async def get_hzdr_shot_detail_by_key(
    source_key: str, shot_key: str
) -> HZDRShotDetail | None:
    """Get one date-scoped shot with basic HDF5 structure metadata."""
    return HZDRSourceProvider(settings.metadata).get_shot_detail_by_key(
        source_key, shot_key
    )


@hzdr_router.get("/hzdr/sources/{source_key}/shots/{shot_number}")
async def get_hzdr_shot_detail(
    source_key: str, shot_number: int
) -> HZDRShotDetail | None:
    """Get one shot with basic HDF5 structure metadata."""
    return HZDRSourceProvider(settings.metadata).get_shot_detail(
        source_key, shot_number
    )


@hzdr_router.get(
    "/hzdr/sources/{source_key}/shots/{shot_number}/datasets/{dataset_name:path}"
)
async def preview_hzdr_dataset(
    source_key: str,
    shot_number: int,
    dataset_name: str,
    shot_key: str | None = None,
) -> HZDRDatasetPreview | None:
    """Preview one HDF5 dataset for a selected HZDR shot."""
    return HZDRSourceProvider(settings.metadata).get_dataset_preview(
        source_key, shot_number, dataset_name, shot_key=shot_key
    )


@hzdr_router.patch("/hzdr/sources/{source_key}/shots/{shot_number}/status")
async def update_hzdr_shot_status(
    source_key: str,
    shot_number: int,
    payload: HZDRShotStatusUpdate,
    user: OAuthUserInfo,
    shot_key: str | None = None,
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
        shot_key=shot_key,
        status=payload.status,
        note=payload.note,
        reviewed_by=user.preferred_username or user.email,
    )


@hzdr_router.patch("/hzdr/sources/{source_key}/shots/{shot_number}/metadata")
async def update_hzdr_shot_metadata(
    source_key: str,
    shot_number: int,
    payload: HZDRShotMetadataUpdate,
    user: OAuthUserInfo,
    shot_key: str | None = None,
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
        shot_key=shot_key,
        key=payload.key,
        value=payload.value,
        note=payload.note,
        corrected_by=user.preferred_username or user.email,
    )


@hzdr_router.get("/hzdr/sources/{source_key}/review")
async def get_hzdr_review(source_key: str) -> HZDRReviewResponse:
    """Get what waits for a reviewer in one source, with the match summary."""
    source = HZDRSourceProvider(settings.metadata).get_source(source_key)
    if source is None:
        raise HTTPException(status_code=404, detail="HZDR source not found.")
    unassigned_shots = [
        shot for shot in source.shots if shot.experiment_id_source == "unassigned"
    ]
    return HZDRReviewResponse(
        match_summary=source.match_summary,
        review_events=source.review_events,
        unassigned_shots=unassigned_shots,
        experiment_rulings=_pending_experiment_rulings({
            shot.shot_number for shot in unassigned_shots
        }),
    )


def _pending_experiment_rulings(shot_numbers: set[int]) -> list[HZDRExperimentRuling]:
    """Rulings recorded beside the served catalog for these shot numbers.

    Rulings are written to the sidecar of the configured ``sources_file`` (see
    ``assign_hzdr_experiment``), so that is the one sidecar read here.
    """
    sources_file = settings.metadata.sources_file
    if settings.metadata.provider != "local" or sources_file is None:
        return []
    records = load_experiment_ruling_records([review_sidecar_path(sources_file)])
    return [
        HZDRExperimentRuling.model_validate(records[number])
        for number in sorted(shot_numbers)
        if number in records
    ]


@hzdr_router.post("/hzdr/experiment-rulings", status_code=202)
async def assign_hzdr_experiment(
    payload: HZDRAssignExperimentRequest, user: OAuthUserInfo
) -> dict[str, Any]:
    """Persist an experiment ruling for the next canonical rebuild."""
    sources_file = settings.metadata.sources_file
    if settings.metadata.provider != "local" or sources_file is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Experiment rulings require local metadata provider and sources_file."
            ),
        )
    if not sources_file.exists():
        raise HTTPException(status_code=404, detail="HZDR sources file not found.")
    if payload.review_level not in REVIEW_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"review_level must be one of {REVIEW_LEVELS}",
        )
    try:
        append_experiment_ruling(
            sources_file,
            shot_number=payload.shot_number,
            experiment_id=payload.experiment_id,
            by=user.preferred_username or user.email,
            note=payload.note,
            review_level=payload.review_level,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # Rulings change no spool file, so ask for the rebuild that applies them
    # rather than wait for the next event.
    return {
        "shot_number": payload.shot_number,
        "experiment_id": payload.experiment_id,
        "review_level": payload.review_level,
        "status": "pending_rebuild",
        "rebuild_requested": request_rebuild(),
    }


@hzdr_router.post("/hzdr/sources/{source_key}/review/{event_id}/confirm")
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
        review_level=payload.review_level,
    )


@hzdr_router.post("/hzdr/sources/{source_key}/review/{event_id}/dismiss")
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
        review_level=payload.review_level,
    )


@hzdr_router.post("/hzdr/emulator/events")
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

    if _is_trigger_source(event_source):
        event_source, event_kind = TRIGGER_SOURCE, TRIGGER_KIND
    elif _is_watchdog_source(event_source):
        event_source = WATCHDOG_SOURCE
        event_kind = f"watchdog.{EMULATED_WATCH_NAME}"

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

    shot_record: dict[str, Any] = {
        "source_key": source_record["key"],
        "shot_number": next_shot_number,
        "fired_at": fired_at,
        "hdf5_path": hdf5_path,
        "metadata": metadata,
    }
    if event_source == TRIGGER_SOURCE:
        # The trigger named no campaign; the emulator resolved it to the
        # selected one, as the builder does from the campaign schedule.
        shot_record["experiment_id_source"] = "schedule"
    shots.append(shot_record)
    _write_sources_payload(sources_file, payload, sources)

    _append_staged_emulator_event(
        sources_file=sources_file,
        experiment_id=experiment_id,
        shot_id=shot_id,
        shot_number=next_shot_number,
        fired_at=fired_at,
        event_source=event_source,
        event_kind=event_kind,
        metadata=metadata,
    )

    return HZDRSource.model_validate(source_record)


def _find_local_shot(
    source_record: dict[str, Any], shot_number: int, shot_key: str | None
) -> dict[str, Any]:
    """Find one shot in a local catalog record, by ``shot_key`` when given.

    LabFrog restarts shot numbers each day, so a number alone can name several
    shots of a campaign; without a key the first one is used, as before.
    """
    shots = source_record.get("shots", [])
    if shot_key is not None:
        shot = next((shot for shot in shots if shot.get("shot_key") == shot_key), None)
    else:
        shot = next(
            (shot for shot in shots if int(shot.get("shot_number", 0)) == shot_number),
            None,
        )
    if shot is None:
        raise HTTPException(status_code=404, detail="HZDR shot not found.")
    return shot


def update_local_shot_status(
    sources_file: Path,
    *,
    source_key: str,
    shot_number: int,
    shot_key: str | None = None,
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

    shot = _find_local_shot(source_record, shot_number, shot_key)

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
    shot_key: str | None = None,
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

    shot = _find_local_shot(source_record, shot_number, shot_key)

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
    review_level: str = "REVIEWED",
) -> HZDRSource:
    """Attach an ambiguous review event to one of its candidate shots.

    Appends a durable decision to the review sidecar so the builder can
    restore this action on the next rebuild (the sidecar survives; the
    catalog is regenerated). Also updates the live catalog immediately so
    the API response reflects the change without waiting for a rebuild.
    """
    if review_level not in REVIEW_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"review_level must be one of {REVIEW_LEVELS}",
        )
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
    attached_event["review_level"] = review_level
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
            "review_level": review_level,
        })

    review_events.remove(event)
    source_record["review_events"] = review_events
    source_record["match_summary"] = _recompute_match_summary(source_record)

    _write_sources_payload(sources_file, payload, sources)

    append_review_decision(
        sources_file,
        source_key=source_key,
        event_id=event_id,
        action="confirm",
        by=confirmed_by,
        note=note,
        shot_key=shot_key,
        candidate_shot_keys=candidate_shot_keys,
        review_level=review_level,
    )

    return HZDRSource.model_validate(source_record)


def dismiss_local_review_event(
    sources_file: Path,
    *,
    source_key: str,
    event_id: str,
    note: str | None,
    dismissed_by: str,
    review_level: str = "REVIEWED",
) -> HZDRSource:
    """Acknowledge an unmatched review event without attaching it to any shot.

    The event stays in review_events with acknowledged=True and is excluded
    from the unmatched count. Appends a durable decision to the review sidecar
    so the builder restores this acknowledgement on the next rebuild.
    """
    if review_level not in REVIEW_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"review_level must be one of {REVIEW_LEVELS}",
        )
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

    dismissed_at = datetime.now(UTC).isoformat()
    event["acknowledged"] = True
    event["acknowledged_at"] = dismissed_at
    event["acknowledged_by"] = dismissed_by
    event["acknowledged_note"] = note or "Acknowledged with no shot attached"
    event["review_level"] = review_level

    source_record["match_summary"] = _recompute_match_summary(source_record)

    _write_sources_payload(sources_file, payload, sources)

    append_review_decision(
        sources_file,
        source_key=source_key,
        event_id=event_id,
        action="dismiss",
        by=dismissed_by,
        note=note,
        review_level=review_level,
    )

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
    diagnostic_metadata = metadata.setdefault("diagnostic", {})
    if not isinstance(diagnostic_metadata, dict):
        diagnostic_metadata = {}
        metadata["diagnostic"] = diagnostic_metadata
    diagnostic_metadata["detector_signal_mean"] = round(
        float(diagnostic_metadata.get("detector_signal_mean", 2.25)) + 0.11,
        4,
    )
    laser_metadata = metadata.setdefault("laser", {})
    if not isinstance(laser_metadata, dict):
        laser_metadata = {}
        metadata["laser"] = laser_metadata
    laser_metadata["pulse_energy"] = round(
        float(laser_metadata.get("pulse_energy", 12.4)) + 0.03,
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
        shot_number=int(shot.get("shot_number", 0)),
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
    """Create varied metadata for a flow-monitor generated shot.

    Numeric laser/vacuum/target fields are namespaced bare keys per the
    metadata key registry (CLAUDE.md "Metadata key registry", signed off
    2026-07-02; see also hzdr/docs/target-ontology.md §5) - no unit suffix in the
    key name, canonical unit fixed in `hzdr_event.METADATA_KEY_REGISTRY`.
    """
    rng = Random(20260529 + index)  # noqa: S311 - deterministic emulator data.
    target_index = (index % 4) + 1
    metadata = {
        "experiment_id": experiment_id,
        "shot_id": shot_id,
        "status": "processed" if index % 5 else "needs-review",
        "target": {
            "type": "other",
            "name": f"target-{target_index}",
            "provenance": "manual",
            "temperature": round(21.5 + index * 0.25 + rng.uniform(-0.05, 0.05), 2),
        },
        "combined_hdf5_path": hdf5_path,
        "emulated_sequence": index + 1,
        "emulated_source": event_source,
        "emulated_kind": event_kind,
        "laser": {
            "pulse_energy": round(12.4 + index * 0.17 + rng.uniform(-0.08, 0.08), 3),
            "pulse_duration": round(42.0 + index * 0.35 + rng.uniform(-0.08, 0.08), 2),
            "beam_pos_x": round(-0.35 + index * 0.015 + rng.uniform(-0.003, 0.003), 4),
            "beam_pos_y": round(0.18 - index * 0.012 + rng.uniform(-0.003, 0.003), 4),
            # Fixed laser-system constants, repeated on every shot the way a
            # real LaserData producer repeats its own configuration (§3.10 of
            # hzdr/docs/standards-alignment.md). A deployment whose producers
            # do not send them yet can fill the same keys from the
            # DW_API_HZDR_LASER__* block instead. Synthetic values, not a
            # facility measurement: Ti:Sa fundamental, single-shot operation,
            # and the facility-signed p-polarization of DRACO TNSA shots.
            "wavelength": 800.0,
            "repetition_rate": 1.0,
            "polarization": "p",
        },
        "vacuum": {
            "chamber_pressure": round(
                2.5e-5 * (1 + index * 0.04 + rng.uniform(-0.01, 0.01)), 8
            ),
        },
        # Namespaced per the metadata key registry's diagnostic.* convention;
        # the NeXus writer maps these to per-shot NXdetector groups.
        "diagnostic": {
            "xray_counts": int(1450 + index * 37 + rng.randint(-18, 18)),
            "detector_signal_mean": round(
                2.25 + index * 0.22 + rng.uniform(-0.06, 0.06), 4
            ),
            "alignment_score": round(
                0.82 + (index % 6) * 0.025 + rng.uniform(-0.01, 0.01), 4
            ),
        },
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
    if _is_watchdog_source(event_source):
        metadata["watchdog_event_count"] = _next_metadata_counter(
            metadata, "watchdog_event_count"
        )
        metadata["watchdog_last_kind"] = event_kind
        metadata["watchdog_status"] = "shot-event-seen"
        return
    if _is_trigger_source(event_source):
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
    shot_number: int,
    fired_at: str,
    event_source: str,
    event_kind: str,
    metadata: dict,
) -> None:
    """Append one production-shaped JSONL event for the flow monitor.

    ``metadata`` is the catalog shot's metadata. A trigger and a watchdog
    event carry their producer's own metadata instead (see the constants at
    the top of this module) and are checked against ``HZDREventV1`` before
    they are written, so the emulator cannot drift from the contract.
    """
    events_dir = sources_file.parent / "events"
    events_dir.mkdir(parents=True, exist_ok=True)
    event_path = events_dir / f"{_event_file_stem(event_source)}.jsonl"
    if _is_trigger_source(event_source):
        event = _emulated_trigger_event(
            shot_number=shot_number, fired_at=fired_at, metadata=metadata
        )
        HZDREventV1.model_validate(event)
    elif _is_watchdog_source(event_source):
        event = _emulated_watchdog_event(
            campaign=experiment_id,
            shot_number=shot_number,
            fired_at=fired_at,
            metadata=metadata,
        )
        HZDREventV1.model_validate(event)
    else:
        message_id = _emulated_message_id(metadata)
        event = {
            "schema_version": "hzdr-event-v1",
            "event_id": (
                f"{_event_file_stem(event_source)}-emulated-"
                f"{experiment_id}-{shot_id}-{message_id}"
            ),
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


def _is_trigger_source(event_source: str) -> bool:
    """A shot trigger: the authority's source name, or the legacy Shotcounter."""
    return _event_file_stem(event_source) in _TRIGGER_SOURCE_STEMS


def _is_watchdog_source(event_source: str) -> bool:
    return _event_file_stem(event_source) in _WATCHDOG_SOURCE_STEMS


def _emulated_trigger_event(
    *, shot_number: int, fired_at: str, metadata: dict
) -> dict[str, Any]:
    """The shot authority's ``draco.trigger`` envelope for one emulated shot.

    Field for field planet-watchdog's ``shot_authority.trigger_event``; the
    Kafka position is added to ``payload_ref`` the way a consumer sees it.
    """
    sequence = _emulated_message_id(metadata)
    digest = hashlib.sha256(
        f"{EMULATED_AUTHORITY_ID}|0|{shot_number}|{EMULATED_TRIGGER_CHANNEL}".encode()
    ).hexdigest()
    return {
        "schema_version": "hzdr-event-v1",
        "event_id": f"{EMULATED_AUTHORITY_ID}:{digest[:24]}",
        "experiment_id": UNASSIGNED_EXPERIMENT_ID,
        "shot_id": f"shot-{shot_number:06d}",
        "shot_number": shot_number,
        "source": TRIGGER_SOURCE,
        "kind": TRIGGER_KIND,
        "timestamp": fired_at,
        "transport": "kafka",
        "payload_ref": {
            "channel_id": EMULATED_TRIGGER_CHANNEL,
            "run_id": sequence,
            "topic": DRACO_TRIGGER_KAFKA_TOPIC,
            "partition": 0,
            "offset": sequence,
        },
        "values": None,
        "metadata": {
            "trigger": {
                "channel_id": EMULATED_TRIGGER_CHANNEL,
                "nickname": "emulated",
                "role": "threshold_crossing",
                "threshold": 0.5,
                "adc_value": 0.81,
                "channel_trigger_count": sequence,
                "sample_counter_10hz": sequence * 10,
                "counter_epoch": 0,
                "configured_campaign": None,
            },
            "shot_authority": {
                "source_id": EMULATED_AUTHORITY_ID,
                "version": "emulated",
                "time_source": "device_local",
                "received_utc": fired_at,
            },
        },
    }


def _emulated_watchdog_event(
    *, campaign: str, shot_number: int, fired_at: str, metadata: dict
) -> dict[str, Any]:
    """A DAQ File Watchdog file event attributed to one emulated shot.

    The shape planet-watchdog's ``kafka_output`` sends for a rule that opted
    in to attribution: the campaign is left to DAMNIT (``unassigned``, the
    configured one rides along as advisory metadata), the shot number comes
    from the trigger window, and the registered metadata namespaces say which
    instrument, which PC and how the file was attributed. The file is not
    written: ``payload_ref`` only names where it would be.
    """
    try:
        sequence = int(metadata.get("watchdog_event_count", 1))
    except (TypeError, ValueError):
        sequence = 1
    try:
        fired = datetime.fromisoformat(fired_at)
    except ValueError:
        fired = datetime(2026, 5, 22, 8, 30, 1, tzinfo=UTC)
    acquired = fired + timedelta(seconds=EMULATED_ATTRIBUTION_DELTA_S)
    seen = acquired + timedelta(seconds=0.3)
    stamp = fired.strftime("%Y-%m-%d_%Hh-%Mm-%Ss")
    filename = f"set1_{stamp}_{sequence}_original.png"
    folder = f"/bigdata/HPLexp/{campaign}/{EMULATED_WATCH_NAME}"
    path = f"{folder}/{filename}"
    timestamp = seen.isoformat()
    identity = {
        "experiment_id": UNASSIGNED_EXPERIMENT_ID,
        "watch_name": EMULATED_WATCH_NAME,
        "timestamp": timestamp,
        "filepath": path,
        "filename": filename,
        "shot_number": shot_number,
    }
    digest = hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        "schema_version": "hzdr-event-v1",
        "event_id": f"watchdog-{digest[:24]}",
        "experiment_id": UNASSIGNED_EXPERIMENT_ID,
        "shot_id": f"shot-{shot_number:06d}",
        "shot_number": shot_number,
        "source": WATCHDOG_SOURCE,
        "kind": f"watchdog.{EMULATED_WATCH_NAME}",
        "timestamp": timestamp,
        "transport": "kafka",
        "payload_ref": {
            "filename": filename,
            "path": path,
            "uri": f"file://{path}",
            "zmq_topic": EMULATED_TRIGGER_CHANNEL,
            "topic": WATCHDOG_KAFKA_TOPIC,
            "partition": 0,
            "offset": sequence,
        },
        "values": None,
        "metadata": {
            "watch": {
                "watch_name": EMULATED_WATCH_NAME,
                "watch_path": folder,
                "watch_pattern": "*_original.png",
                "host": EMULATED_PRODUCER["host"],
                "configured_experiment_id": campaign,
            },
            "analysis": {},
            "instrument": dict(EMULATED_INSTRUMENT),
            "attribution": {
                "method": "trigger_window",
                "status": "attributed",
                "delta_s": EMULATED_ATTRIBUTION_DELTA_S,
                "candidates": [shot_number],
            },
            "acquisition": {
                "time": acquired.isoformat(),
                "time_source": "first_seen",
            },
            "producer": dict(EMULATED_PRODUCER),
            "shot_number_provenance": {
                "authoritative": True,
                "source": "watchdog attribution (trigger_window)",
            },
        },
    }


def _transport_for_event_source(event_source: str) -> str:
    """Mirror the production transport used by well-known HZDR sources."""
    source = _event_file_stem(event_source)
    if source == "laserdata":
        return "asapo"
    return "flow-monitor"


def _payload_ref_for_event_source(
    event_source: str, metadata: dict
) -> dict[str, str | int]:
    """Build the staged payload reference for a flow-monitor event."""
    message_id = _emulated_message_id(metadata)
    source = _event_file_stem(event_source)
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
    diagnostic = metadata.get("diagnostic")
    if isinstance(diagnostic, dict) and "detector_signal_mean" in diagnostic:
        return [float(diagnostic.get("detector_signal_mean") or 0.0)]
    # Pre-namespace flat spelling, kept for hand-written source fixtures.
    return [float(metadata.get("detector_signal_mean", 0.0))]


def _emulated_message_id(metadata: dict) -> int:
    """Return a stable message id even for hand-written source fixtures."""
    value = metadata.get("emulated_sequence", metadata.get("emulated_enrich_count", 1))
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1
