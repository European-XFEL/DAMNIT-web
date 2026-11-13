"""Explicit DAMNIT adoption of the plugin's durable managed publishing route."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

import httpx

from .hzdr_scicat_summary import campaign_files
from .scicat import _sha256

if TYPE_CHECKING:
    from ..shared.hzdr_settings import HZDRScicatSettings

logger = logging.getLogger(__name__)


def _preview_reference(
    settings: HZDRScicatSettings, master: Path
) -> dict[str, str] | None:
    if settings.preview_path is None:
        return None
    path = settings.preview_path
    if not path.is_absolute():
        path = master.parent / path
    path = path.resolve(strict=True)
    if not path.is_file() or path.stat().st_size > 256 * 1024:
        message = "SciCat preview must be a regular image no larger than 256 KiB"
        raise ValueError(message)
    return {"path": str(path), "caption": settings.preview_caption}


def _publish_fingerprint(body: dict[str, Any]) -> str:
    snapshot = {k: v for k, v in body.items() if k not in {"pid", "operation"}}
    if body.get("preview"):
        snapshot["preview_sha256"] = _sha256(Path(body["preview"]["path"]))
    return hashlib.sha256(
        json.dumps(snapshot, sort_keys=True, allow_nan=False).encode()
    ).hexdigest()


def publishing_body(
    settings: HZDRScicatSettings,
    nexus_path: Path,
    experiment_id: str,
    source_key: str,
    scientific_metadata: dict[str, Any],
    previous: dict[str, Any] | None,
) -> dict[str, Any]:
    files = campaign_files(nexus_path)
    scientific_metadata = dict(scientific_metadata)
    if settings.instrument_id:
        scientific_metadata.setdefault("configured_instrument", settings.instrument_id)
    coverage = scientific_metadata.get("time_coverage", {})
    body: dict[str, Any] = {
        "publisher": settings.publisher,
        "identity": f"{source_key}/{experiment_id}",
        "operation": "update" if previous and previous.get("scicat_pid") else "create",
        "title": f"HZDR campaign: {experiment_id}",
        "description": (
            f"Canonical campaign master and {len(files) - 1} linked shot containers. "
            "Metadata summarizes canonical shots and normalized source events."
        ),
        "dataset_type": "raw",
        "source_folder": str(nexus_path.parent),
        "files": [
            {"path": str(path), "checksum": "sha256:" + _sha256(path)} for path in files
        ],
        "checksum_policy": "verify",
        "meta": scientific_metadata,
        "keywords": ["HZDR", "campaign", experiment_id],
        # Campaign slugs and display names are not verified SciCat catalogue IDs.
        "instrument_id": settings.catalogue_instrument_id or None,
        "proposal_id": settings.catalogue_proposal_id or None,
        "sample_id": settings.catalogue_sample_id or None,
    }
    if previous and previous.get("scicat_pid"):
        body["pid"] = previous["scicat_pid"]
    if coverage.get("start") and coverage.get("end"):
        body.update(start_time=coverage["start"], end_time=coverage["end"])
    if settings.owner_group:
        body["owner_group"] = settings.owner_group
    if settings.access_groups:
        body["access_groups"] = settings.access_groups
    preview = _preview_reference(settings, nexus_path)
    if preview is not None:
        body["preview"] = preview
    return body


def _compatible_previous(
    previous: dict[str, Any],
    settings: HZDRScicatSettings,
    identity: str,
) -> bool:
    return (
        previous.get("scicat_endpoint") == "publish"
        and previous.get("scicat_identity") == identity
        and previous.get("scicat_publisher") == settings.publisher
        and previous.get("scicat_plugin_url") == settings.plugin_url.rstrip("/")
    )


def register_managed_campaign(
    settings: HZDRScicatSettings,
    nexus_path: Path,
    experiment_id: str,
    source_key: str,
    scientific_metadata: dict[str, Any],
    previous: dict[str, Any] | None,
) -> dict[str, Any] | None:
    identity = f"{source_key}/{experiment_id}"
    if previous and not _compatible_previous(previous, settings, identity):
        logger.warning(
            "SciCat: existing registration needs reviewed managed-mode migration"
        )
        return {**previous, "scicat_action": "migration_required"}
    try:
        body = publishing_body(
            settings,
            nexus_path,
            experiment_id,
            source_key,
            scientific_metadata,
            previous,
        )
        fingerprint = _publish_fingerprint(body)
    except (OSError, ValueError):
        logger.exception("SciCat: could not prepare the explicit campaign inventory")
        return {**previous, "scicat_action": "partial"} if previous else None
    if (
        previous
        and previous.get("scicat_action") not in {"partial", "reconciliation"}
        and previous.get("scicat_publish_fingerprint") == fingerprint
    ):
        return {**previous, "scicat_action": "unchanged"}
    result = {
        **(previous or {}),
        "scicat_endpoint": "publish",
        "scicat_identity": identity,
        "scicat_publisher": settings.publisher,
        "scicat_plugin_url": settings.plugin_url.rstrip("/"),
    }
    try:
        response = httpx.post(
            f"{settings.plugin_url.rstrip('/')}/scicat/publish",
            json=body,
            headers={"X-SciCat-Plugin-Key": settings.api_key.get_secret_value()},
            timeout=settings.timeout,
        )
        data = response.json()
        if not isinstance(data, dict):
            message = "Plugin returned a non-object response"
            raise ValueError(message)
    except (httpx.HTTPError, ValueError):
        logger.exception(
            "SciCat: managed registration failed; retaining registration state"
        )
        return {**result, "scicat_action": "partial"}
    if data.get("pid"):
        result["scicat_pid"] = str(data["pid"])
    result["scicat_preview_state"] = data.get("preview_state", "none")
    if data.get("manifest_digest"):
        result["scicat_manifest_digest"] = data["manifest_digest"]
    if (
        response.is_error
        or data.get("ok") is not True
        or not data.get("pid")
        or data.get("preview_state") == "partial"
    ):
        action = data.get("action")
        result.update(
            scicat_action=action
            if action in {"partial", "reconciliation"}
            else "partial",
            scicat_failed_stage=data.get("failed_stage", "plugin_request"),
        )
        logger.warning(
            "SciCat: managed registration incomplete at %s",
            result["scicat_failed_stage"],
        )
        return result
    result.update(
        scicat_action=data.get("action"),
        scicat_publish_fingerprint=fingerprint,
        scicat_registered_at=datetime.now(UTC).isoformat(),
    )
    result.pop("scicat_failed_stage", None)
    if settings.frontend_url and result.get("scicat_pid"):
        encoded_pid = quote(result["scicat_pid"], safe="")
        result["scicat_dataset_url"] = (
            f"{settings.frontend_url.rstrip('/')}/datasets/{encoded_pid}"
        )
    logger.info(
        "SciCat: %s campaign %s, pid %s",
        result["scicat_action"],
        experiment_id,
        result.get("scicat_pid"),
    )
    return result
