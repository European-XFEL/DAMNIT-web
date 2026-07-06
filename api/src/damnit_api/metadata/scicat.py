"""SciCat registration of the canonical campaign NeXus file.

The ``scicat_plugin`` is an HTTP service (Flask), so the integration boundary is
a POST, not an import — which also sidesteps the Flask-vs-FastAPI in-process
mismatch.  DAMNIT posts the *path* of the built NeXus file plus assembled
``scientificMetadata``; the plugin registers path + metadata only (SciCat forbids
binary upload) and returns a dataset ``pid``.

This runs as a builder post-step, off the go-live critical path.  Every failure
here is swallowed and logged: SciCat registration must never fail a build.  The
SciCat URL/token stay in the plugin's own env — DAMNIT only knows the plugin URL.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from pathlib import Path  # noqa: TC003
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

if TYPE_CHECKING:
    from ..shared.hzdr_settings import HZDRScicatSettings

logger = logging.getLogger(__name__)

# Source-catalog metadata keys under which a registration is persisted.  Read
# back by the /scicat endpoint and by read_previous_registration for skip logic.
_PID_KEY = "scicat_pid"
_VERSION_HASH_KEY = "scicat_version_hash"
_SHA256_KEY = "scicat_source_sha256"
_REGISTERED_AT_KEY = "scicat_registered_at"
_DATASET_URL_KEY = "scicat_dataset_url"
_ENDPOINT_KEY = "scicat_endpoint"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _dataset_url(frontend_url: str, pid: str) -> str | None:
    base = frontend_url.rstrip("/")
    if not base or not pid:
        return None
    return f"{base}/datasets/{quote(pid, safe='')}"


def read_previous_registration(
    sources_file: Path, source_key: str
) -> dict[str, Any] | None:
    """Return the SciCat block persisted in an existing catalog, or None.

    Used to skip re-registration when a rebuild is byte-identical (the auto
    builder-trigger can rebuild frequently, so avoiding a needless SciCat POST on
    every debounced rebuild matters).
    """
    if not sources_file.exists():
        return None
    try:
        payload = json.loads(sources_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    for source in payload.get("sources", []):
        if source.get("key") != source_key:
            continue
        metadata = source.get("metadata", {})
        pid = metadata.get(_PID_KEY)
        if not pid:
            return None
        return {
            _PID_KEY: pid,
            _VERSION_HASH_KEY: metadata.get(_VERSION_HASH_KEY),
            _SHA256_KEY: metadata.get(_SHA256_KEY),
            _REGISTERED_AT_KEY: metadata.get(_REGISTERED_AT_KEY),
            _DATASET_URL_KEY: metadata.get(_DATASET_URL_KEY),
            _ENDPOINT_KEY: metadata.get(_ENDPOINT_KEY),
        }
    return None


def _build_body(
    settings: HZDRScicatSettings,
    nexus_path: Path,
    experiment_id: str,
    scientific_metadata: dict[str, Any],
    source_folder: str,
    source_sha256: str,
) -> dict[str, Any]:
    meta: dict[str, Any] = {
        **scientific_metadata,
        "proposalId": experiment_id,
        "experimentId": experiment_id,
    }
    if settings.instrument_id:
        meta["instrumentId"] = settings.instrument_id
    body: dict[str, Any] = {
        "title": f"HZDR canonical campaign ({experiment_id})",
        "dataset_type": settings.dataset_type,
        "source_folder": source_folder,
        "meta": meta,
    }
    if settings.endpoint == "push":
        body["files"] = [{"path": str(nexus_path), "checksum": source_sha256}]
    else:
        body["filepath"] = str(nexus_path)
    if settings.owner_group:
        body["owner_group"] = settings.owner_group
    if settings.access_groups:
        body["access_groups"] = settings.access_groups
    return body


def register_campaign_nexus(
    *,
    settings: HZDRScicatSettings,
    nexus_path: Path,
    experiment_id: str,
    source_key: str,
    scientific_metadata: dict[str, Any],
    source_folder: str,
    previous: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Register the campaign NeXus file with SciCat via the plugin.  Never raises.

    Returns a metadata block (``scicat_pid`` etc.) to stamp into the source
    catalog, or None when disabled / unregistered / failed.  When ``previous``
    carries a pid for an identical NeXus file (same sha256), the POST is skipped
    and ``previous`` is returned unchanged.
    """
    if not settings.enabled:
        return None
    if not nexus_path.exists():
        logger.warning("SciCat: NeXus file %s does not exist; skipping", nexus_path)
        return None

    try:
        source_sha256 = _sha256(nexus_path)
    except OSError:
        logger.exception("SciCat: could not hash %s; skipping", nexus_path)
        return None

    if (
        previous
        and previous.get(_SHA256_KEY) == source_sha256
        and previous.get(_PID_KEY)
    ):
        logger.info(
            "SciCat: %s unchanged (sha256 match); reusing pid %s",
            nexus_path.name,
            previous[_PID_KEY],
        )
        return previous

    body = _build_body(
        settings,
        nexus_path,
        experiment_id,
        scientific_metadata,
        source_folder,
        source_sha256,
    )
    url = f"{settings.plugin_url.rstrip('/')}/scicat/{settings.endpoint}"

    try:
        import httpx

        response = httpx.post(url, json=body, timeout=settings.timeout)
        response.raise_for_status()
        data = response.json()
    except Exception:
        logger.exception("SciCat: registration POST to %s failed", url)
        return None

    if data.get("ok") is False or not data.get("pid"):
        logger.error("SciCat: plugin rejected registration: %s", data)
        return None

    pid = str(data["pid"])
    result: dict[str, Any] = {
        _PID_KEY: pid,
        _SHA256_KEY: source_sha256,
        _REGISTERED_AT_KEY: datetime.now(UTC).isoformat(),
        _ENDPOINT_KEY: settings.endpoint,
    }
    if data.get("version_hash"):
        result[_VERSION_HASH_KEY] = str(data["version_hash"])
    dataset_url = _dataset_url(settings.frontend_url, pid)
    if dataset_url:
        result[_DATASET_URL_KEY] = dataset_url
    logger.info("SciCat: registered %s as pid %s", nexus_path.name, pid)
    return result
