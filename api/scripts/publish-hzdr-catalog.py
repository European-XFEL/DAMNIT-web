"""Publish DAMNIT-web HZDR source metadata to scicat-plugin."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

SCICAT_DEFAULT_URL = "http://127.0.0.1:5001"
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCES_FILE = (
    REPO_ROOT / ".generated" / "hzdr-package-emulator" / "hzdr_sources.json"
)


@dataclass(frozen=True)
class PublishResult:
    """One scicat-plugin publication response."""

    endpoint: str
    status_code: int
    body: dict[str, Any] | str


def load_sources_file(path: Path) -> list[dict[str, Any]]:
    """Load a local HZDR sources file."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        sources = payload.get("sources", [])
    elif isinstance(payload, list):
        sources = payload
    else:
        msg = "HZDR sources file must contain an object or list."
        raise ValueError(msg)

    if not isinstance(sources, list):
        msg = "HZDR sources payload must contain a sources list."
        raise ValueError(msg)
    return [source for source in sources if isinstance(source, dict)]


def iter_catalog_payloads(
    sources: list[dict[str, Any]],
    *,
    source_key: str | None = None,
    shot_number: int | None = None,
):
    """Yield DAMNIT catalog payloads for matching shots."""
    for source in sources:
        if source_key and source.get("key") != source_key:
            continue
        shots = source.get("shots", [])
        if not isinstance(shots, list):
            continue
        for shot in shots:
            if not isinstance(shot, dict):
                continue
            if (
                shot_number is not None
                and int(shot.get("shot_number", -1)) != shot_number
            ):
                continue
            yield build_damnit_catalog_payload(source, shot)


def build_damnit_catalog_payload(
    source: dict[str, Any], shot: dict[str, Any]
) -> dict[str, Any]:
    """Build the proposed /scicat/from-damnit payload for one shot."""
    source_metadata = _dict_value(source.get("metadata"))
    shot_metadata = _dict_value(shot.get("metadata"))
    source_key = str(source.get("key", shot.get("source_key", "unknown-source")))
    source_title = str(source.get("title") or source_key)
    shot_number = int(shot.get("shot_number", 0))
    experiment_id = str(
        shot_metadata.get("experiment_id")
        or source_metadata.get("experiment_id")
        or "unknown-experiment"
    )
    shot_id = str(shot_metadata.get("shot_id") or f"shot-{shot_number:06d}")
    file_path = _catalog_file_path(source, shot, shot_metadata)
    if not file_path:
        msg = f"Shot {shot_number} in {source_key} has no HDF5/catalog file path."
        raise ValueError(msg)

    title = f"{source_title} shot {shot_number}"
    dataset = {
        "filepath": file_path,
        "files": [{"path": file_path, "checksum": ""}],
        "source_folder": _source_folder(file_path),
        "title": title,
        "description": (
            f"DAMNIT-web HZDR catalog publish for {experiment_id} / {shot_id}"
        ),
        "dataset_type": "raw",
        "meta": {
            "damnit": {
                "source_key": source_key,
                "source_title": source_title,
                "shot_number": shot_number,
                "shot_id": shot_id,
                "experiment_id": experiment_id,
                "fired_at": shot.get("fired_at"),
                "review_status": shot_metadata.get("status"),
            },
            "source_metadata": source_metadata,
            "shot_metadata": shot_metadata,
        },
    }
    return {
        "schema": "damnit-web-hzdr.catalog.v1",
        "origin": "DAMNIT-web-hzdr",
        "source": {
            "key": source_key,
            "title": source_title,
            "metadata": source_metadata,
        },
        "shot": {
            "source_key": source_key,
            "shot_number": shot_number,
            "shot_id": shot_id,
            "experiment_id": experiment_id,
            "fired_at": shot.get("fired_at"),
            "metadata": shot_metadata,
        },
        "dataset": dataset,
    }


def publish_payload(
    scicat_url: str,
    payload: dict[str, Any],
    *,
    endpoint: str = "auto",
    timeout: float = 10.0,
    session: requests.Session | None = None,
) -> PublishResult:
    """Post one catalog payload to scicat-plugin."""
    selected_session = session or requests.Session()
    if endpoint == "auto":
        result = _post_endpoint(
            selected_session,
            scicat_url,
            "from-damnit",
            payload,
            timeout,
        )
        if result.status_code not in {404, 405}:
            _raise_for_result(result)
            return result
        fallback = _post_endpoint(
            selected_session,
            scicat_url,
            "from-json",
            from_json_payload(payload),
            timeout,
        )
        _raise_for_result(fallback)
        return fallback

    body = payload if endpoint == "from-damnit" else from_json_payload(payload)
    result = _post_endpoint(selected_session, scicat_url, endpoint, body, timeout)
    _raise_for_result(result)
    return result


def from_json_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Convert a DAMNIT catalog payload to today's /scicat/from-json shape."""
    dataset = dict(payload["dataset"])
    dataset["type"] = dataset.pop("dataset_type", "raw")
    return dataset


def _post_endpoint(
    session: requests.Session,
    scicat_url: str,
    endpoint: str,
    payload: dict[str, Any],
    timeout: float,
) -> PublishResult:
    response = session.post(
        f"{scicat_url.rstrip('/')}/scicat/{endpoint}",
        json=payload,
        timeout=timeout,
    )
    try:
        body: dict[str, Any] | str = response.json()
    except ValueError:
        body = response.text
    return PublishResult(
        endpoint=endpoint,
        status_code=response.status_code,
        body=body,
    )


def _raise_for_result(result: PublishResult) -> None:
    if result.status_code >= 400:
        msg = (
            f"scicat-plugin /scicat/{result.endpoint} failed with "
            f"{result.status_code}: {result.body}"
        )
        raise RuntimeError(msg)


def _dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _catalog_file_path(
    source: dict[str, Any], shot: dict[str, Any], shot_metadata: dict[str, Any]
) -> str:
    for candidate in (
        shot.get("hdf5_path"),
        shot_metadata.get("combined_hdf5_path"),
        shot_metadata.get("hdf5_path"),
    ):
        if candidate:
            return str(candidate)
    data_paths = source.get("data_paths", [])
    if isinstance(data_paths, list) and data_paths:
        return str(data_paths[0])
    return ""


def _source_folder(file_path: str) -> str:
    return str(Path(file_path).parent)


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--sources-file",
        type=Path,
        default=DEFAULT_SOURCES_FILE,
        help="Local HZDR sources JSON produced by the launcher/emulator.",
    )
    parser.add_argument("--scicat-url", default=SCICAT_DEFAULT_URL)
    parser.add_argument(
        "--endpoint",
        choices=["auto", "from-damnit", "from-json"],
        default="auto",
        help="auto tries /scicat/from-damnit and falls back to /scicat/from-json.",
    )
    parser.add_argument("--source-key")
    parser.add_argument("--shot-number", type=int)
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> None:
    """Publish selected HZDR shots to scicat-plugin."""
    args = parse_args()
    sources = load_sources_file(args.sources_file)
    payloads = list(
        iter_catalog_payloads(
            sources,
            source_key=args.source_key,
            shot_number=args.shot_number,
        )
    )[: args.limit]
    if not payloads:
        msg = "No matching HZDR shots found."
        raise SystemExit(msg)

    if args.dry_run:
        print(json.dumps(payloads, indent=2, sort_keys=True))
        return

    results = [
        publish_payload(
            args.scicat_url,
            payload,
            endpoint=args.endpoint,
            timeout=args.timeout,
        )
        for payload in payloads
    ]
    if args.json:
        print(json.dumps([result.__dict__ for result in results], indent=2))
        return
    for payload, result in zip(payloads, results, strict=True):
        shot = payload["shot"]
        print(
            "Published "
            f"{shot['source_key']} shot {shot['shot_number']} "
            f"via /scicat/{result.endpoint}: {result.status_code}"
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Catalog publish failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
