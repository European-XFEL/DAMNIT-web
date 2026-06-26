"""Tests for the MediaWiki campaign link endpoint.

GET /metadata/hzdr/sources/{source_key}/wiki
GET /metadata/hzdr/sources/{source_key}/wiki?fetch=true
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import orjson
import pytest
from fastapi.testclient import TestClient

from damnit_api.main import create_app
from damnit_api.metadata.routers import _fetch_wiki_page_info
from damnit_api.metadata.hzdr_sources import HZDRWikiInfo
from damnit_api.shared.settings import HZDRWikiSettings, MetadataSettings, settings


EXPERIMENT_ID = "Solenoid_Beamline_Tests_01.2025"
SOURCE_KEY = "hzdr-solenoid-beamline-tests-01-2025"
WIKI_BASE = "https://wiki.hzdr.de"


def write_wiki_source_fixture(tmp_path: Path) -> Path:
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": SOURCE_KEY,
                    "title": "Solenoid Beamline Tests 01.2025",
                    "damnit_path": str(tmp_path / "damnit"),
                    "metadata": {
                        "experiment_id": EXPERIMENT_ID,
                        "facility": "HZDR",
                    },
                    "shots": [],
                }
            ]
        })
    )
    return path


def write_wiki_source_fixture_no_experiment_id(tmp_path: Path) -> Path:
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": SOURCE_KEY,
                    "title": "Solenoid Beamline Tests 01.2025",
                    "damnit_path": str(tmp_path / "damnit"),
                    "metadata": {"facility": "HZDR"},
                    "shots": [],
                }
            ]
        })
    )
    return path


def write_wiki_source_with_explicit_url(tmp_path: Path) -> Path:
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": SOURCE_KEY,
                    "title": "Solenoid Beamline Tests 01.2025",
                    "damnit_path": str(tmp_path / "damnit"),
                    "metadata": {
                        "experiment_id": EXPERIMENT_ID,
                        "wiki_page_url": "https://wiki.hzdr.de/index.php/Custom_Page",
                    },
                    "shots": [],
                }
            ]
        })
    )
    return path


@pytest.fixture()
def local_app(tmp_path, monkeypatch):
    """App with a local sources fixture and wiki base URL configured."""
    sources_file = write_wiki_source_fixture(tmp_path)
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings.hzdr_wiki, "base_url", WIKI_BASE)
    monkeypatch.setattr(settings, "damnit_path", tmp_path)
    return create_app()


@pytest.fixture()
def local_app_no_wiki(tmp_path, monkeypatch):
    """App with a local sources fixture but no wiki base URL."""
    sources_file = write_wiki_source_fixture(tmp_path)
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings.hzdr_wiki, "base_url", "")
    monkeypatch.setattr(settings, "damnit_path", tmp_path)
    return create_app()


# ---------------------------------------------------------------------------
# URL derivation tests (no network call)
# ---------------------------------------------------------------------------


def test_wiki_url_derived_from_experiment_id(local_app):
    """experiment_id is used to build the page URL when base_url is configured."""
    with TestClient(local_app) as client:
        resp = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/wiki")

    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["experiment_id"] == EXPERIMENT_ID
    assert data["page_title"] == EXPERIMENT_ID
    assert data["page_url"] == f"{WIKI_BASE}/index.php/{EXPERIMENT_ID}"
    assert data["exists"] is None  # not fetched
    assert data["last_modified"] is None
    assert data["categories"] == []


def test_wiki_url_not_configured_returns_null_url(local_app_no_wiki):
    """Without base_url, configured=false and page_url is null."""
    with TestClient(local_app_no_wiki) as client:
        resp = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/wiki")

    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is False
    assert data["page_url"] is None
    assert data["experiment_id"] == EXPERIMENT_ID


def test_wiki_url_explicit_override_respected(tmp_path, monkeypatch):
    """A metadata.wiki_page_url in the source overrides the derived URL."""
    sources_file = write_wiki_source_with_explicit_url(tmp_path)
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings.hzdr_wiki, "base_url", WIKI_BASE)
    monkeypatch.setattr(settings, "damnit_path", tmp_path)
    app = create_app()

    with TestClient(app) as client:
        resp = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/wiki")

    assert resp.status_code == 200
    assert resp.json()["page_url"] == "https://wiki.hzdr.de/index.php/Custom_Page"


def test_wiki_falls_back_to_source_key_when_no_experiment_id(tmp_path, monkeypatch):
    """source_key is used as page_title when experiment_id is absent."""
    sources_file = write_wiki_source_fixture_no_experiment_id(tmp_path)
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings.hzdr_wiki, "base_url", WIKI_BASE)
    monkeypatch.setattr(settings, "damnit_path", tmp_path)
    app = create_app()

    with TestClient(app) as client:
        resp = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/wiki")

    assert resp.status_code == 200
    data = resp.json()
    assert data["experiment_id"] is None
    assert data["page_title"] == SOURCE_KEY
    assert data["page_url"] == f"{WIKI_BASE}/index.php/{SOURCE_KEY}"


def test_wiki_missing_source_returns_404(local_app):
    """A non-existent source_key raises 404."""
    with TestClient(local_app) as client:
        resp = client.get("/metadata/hzdr/sources/nonexistent/wiki")

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Live API fetch tests (network mocked)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_wiki_page_info_populates_fields():
    """A successful MediaWiki API response populates exists/last_modified/categories."""
    api_response = {
        "query": {
            "pages": {
                "12345": {
                    "pageid": 12345,
                    "title": EXPERIMENT_ID,
                    "touched": "2025-01-15T09:00:00Z",
                    "categories": [
                        {"title": "Category:DRACO campaigns"},
                        {"title": "Category:Laser experiments"},
                    ],
                }
            }
        }
    }

    mock_response = MagicMock()
    mock_response.json.return_value = api_response
    mock_response.raise_for_status = MagicMock()

    info = HZDRWikiInfo(
        source_key=SOURCE_KEY,
        experiment_id=EXPERIMENT_ID,
        page_title=EXPERIMENT_ID,
        page_url=f"{WIKI_BASE}/index.php/{EXPERIMENT_ID}",
        configured=True,
    )

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await _fetch_wiki_page_info(info, WIKI_BASE, request_timeout=5.0)

    assert result.exists is True
    assert result.page_id == 12345
    assert result.last_modified == "2025-01-15T09:00:00Z"
    assert set(result.categories) == {"DRACO campaigns", "Laser experiments"}


@pytest.mark.asyncio
async def test_fetch_wiki_page_info_missing_page():
    """A MediaWiki 'missing' flag sets exists=False."""
    api_response = {
        "query": {
            "pages": {
                "-1": {
                    "missing": "",
                    "title": "Nonexistent_Campaign",
                }
            }
        }
    }

    mock_response = MagicMock()
    mock_response.json.return_value = api_response
    mock_response.raise_for_status = MagicMock()

    info = HZDRWikiInfo(
        source_key=SOURCE_KEY,
        experiment_id="Nonexistent_Campaign",
        page_title="Nonexistent_Campaign",
        page_url=f"{WIKI_BASE}/index.php/Nonexistent_Campaign",
        configured=True,
    )

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await _fetch_wiki_page_info(info, WIKI_BASE, request_timeout=5.0)

    assert result.exists is False
    assert result.categories == []


@pytest.mark.asyncio
async def test_fetch_wiki_page_info_network_error_returns_info_unchanged():
    """A network failure returns the original info without raising."""
    info = HZDRWikiInfo(
        source_key=SOURCE_KEY,
        experiment_id=EXPERIMENT_ID,
        page_title=EXPERIMENT_ID,
        page_url=f"{WIKI_BASE}/index.php/{EXPERIMENT_ID}",
        configured=True,
    )

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))
        mock_client_cls.return_value = mock_client

        result = await _fetch_wiki_page_info(info, WIKI_BASE, request_timeout=5.0)

    assert result.exists is None
    assert result.last_modified is None
    assert result.categories == []


def test_wiki_endpoint_with_fetch_param_calls_api(local_app):
    """fetch=true triggers an API call; on failure the URL is still returned."""
    with patch(
        "damnit_api.metadata.routers._fetch_wiki_page_info",
        new_callable=AsyncMock,
    ) as mock_fetch:
        mock_fetch.return_value = HZDRWikiInfo(
            source_key=SOURCE_KEY,
            experiment_id=EXPERIMENT_ID,
            page_title=EXPERIMENT_ID,
            page_url=f"{WIKI_BASE}/index.php/{EXPERIMENT_ID}",
            configured=True,
            exists=True,
            page_id=42,
            last_modified="2025-01-15T09:00:00Z",
            categories=["DRACO campaigns"],
        )

        with TestClient(local_app) as client:
            resp = client.get(
                f"/metadata/hzdr/sources/{SOURCE_KEY}/wiki?fetch=true"
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["exists"] is True
    assert data["page_id"] == 42
    assert data["categories"] == ["DRACO campaigns"]
    mock_fetch.assert_awaited_once()


# ---------------------------------------------------------------------------
# Settings unit test
# ---------------------------------------------------------------------------


def test_hzdr_wiki_settings_defaults():
    """Default HZDRWikiSettings has empty base_url and 5-second timeout."""
    s = HZDRWikiSettings()
    assert s.base_url == ""
    assert s.fetch_timeout == 5.0
