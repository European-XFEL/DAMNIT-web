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
from pathlib import Path, PurePath  # noqa: TC003
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
_FINGERPRINT_KEY = "scicat_content_fingerprint"
_REGISTERED_AT_KEY = "scicat_registered_at"
_DATASET_URL_KEY = "scicat_dataset_url"
_ENDPOINT_KEY = "scicat_endpoint"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


# Attributes a build rewrites every time without changing the content. The
# file's SHA-256 changes with them, which made every rebuild a new SciCat
# dataset (ledger I7); the content fingerprint leaves them out.
VOLATILE_ATTRS = frozenset({"damnit_bridge_updated_at"})


def _hash_value(digest: Any, value: Any) -> None:
    import numpy as np

    array = np.asarray(value)
    digest.update(array.dtype.str.encode())
    digest.update(repr(array.shape).encode())
    if array.dtype.kind in {"O", "U", "S", "V"}:
        digest.update(repr(array.tolist()).encode())
    else:
        digest.update(np.ascontiguousarray(array).tobytes())


def _hash_attrs(digest: Any, obj: Any) -> None:
    for name in sorted(obj.attrs):
        if name in VOLATILE_ATTRS:
            continue
        digest.update(b"@" + name.encode())
        _hash_value(digest, obj.attrs[name])


def content_fingerprint(path: Path) -> str:
    """SHA-256 over the file's content: every group, dataset, attribute and link.

    Unlike the file's own SHA-256 it ignores ``VOLATILE_ATTRS`` and the HDF5
    layout (free space, object order, timestamps in object headers), so two
    builds of the same content give the same fingerprint. Soft and external
    links count by their target; external files are not opened.
    """
    import h5py

    digest = hashlib.sha256()

    def walk(group: Any, prefix: str) -> None:
        _hash_attrs(digest, group)
        for name in sorted(group):
            path_name = f"{prefix}/{name}"
            link = group.get(name, getlink=True)
            if isinstance(link, h5py.ExternalLink):
                digest.update(f"E{path_name}>{link.filename}:{link.path}".encode())
                continue
            if isinstance(link, h5py.SoftLink):
                digest.update(f"S{path_name}>{link.path}".encode())
                continue
            item = group[name]
            if isinstance(item, h5py.Group):
                digest.update(f"G{path_name}".encode())
                walk(item, path_name)
            else:
                digest.update(f"D{path_name}".encode())
                _hash_attrs(digest, item)
                _hash_value(digest, item[()])

    with h5py.File(path, "r") as handle:
        walk(handle, "")
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

    Used to skip re-registration when a rebuild has the same content (the auto
    builder-trigger can rebuild frequently, and each needless POST creates a
    new SciCat dataset).
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
            _FINGERPRINT_KEY: metadata.get(_FINGERPRINT_KEY),
            _REGISTERED_AT_KEY: metadata.get(_REGISTERED_AT_KEY),
            _DATASET_URL_KEY: metadata.get(_DATASET_URL_KEY),
            _ENDPOINT_KEY: metadata.get(_ENDPOINT_KEY),
        }
    return None


def _build_body(
    settings: HZDRScicatSettings,
    nexus_path: PurePath,
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


def _try_fingerprint(nexus_path: Path) -> str | None:
    try:
        return content_fingerprint(nexus_path)
    except Exception:
        logger.warning(
            "SciCat: could not fingerprint %s; using sha256 only", nexus_path
        )
        return None


def _reuse_previous(
    previous: dict[str, Any] | None,
    nexus_path: Path,
    source_sha256: str,
    fingerprint: str | None,
) -> dict[str, Any] | None:
    """``previous`` (plus the fingerprint) when its content matches, else None."""
    if not previous or not previous.get(_PID_KEY):
        return None
    same_bytes = previous.get(_SHA256_KEY) == source_sha256
    same_content = (
        fingerprint is not None and previous.get(_FINGERPRINT_KEY) == fingerprint
    )
    if not (same_bytes or same_content):
        return None
    logger.info(
        "SciCat: %s unchanged (%s match); reusing pid %s",
        nexus_path.name,
        "sha256" if same_bytes else "content",
        previous[_PID_KEY],
    )
    reused = {k: v for k, v in previous.items() if v is not None}
    if fingerprint is not None:
        reused[_FINGERPRINT_KEY] = fingerprint
    return reused


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
    carries a pid for a NeXus file with the same content (same content
    fingerprint, or the same sha256), the POST is skipped and ``previous`` is
    returned, with the fingerprint added if it lacked one.
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

    fingerprint = _try_fingerprint(nexus_path)
    reused = _reuse_previous(previous, nexus_path, source_sha256, fingerprint)
    if reused is not None:
        return reused

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
    if fingerprint is not None:
        result[_FINGERPRINT_KEY] = fingerprint
    if data.get("version_hash"):
        result[_VERSION_HASH_KEY] = str(data["version_hash"])
    dataset_url = _dataset_url(settings.frontend_url, pid)
    if dataset_url:
        result[_DATASET_URL_KEY] = dataset_url
    logger.info("SciCat: registered %s as pid %s", nexus_path.name, pid)
    return result
