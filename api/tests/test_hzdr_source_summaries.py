"""Home's light per-campaign summary (GET /metadata/hzdr/source-summaries)."""

from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import orjson
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from damnit_api.metadata.hzdr_nexus import append_experiment_ruling
from damnit_api.metadata.hzdr_routers import hzdr_router
from damnit_api.metadata.hzdr_sources import HZDRSource, summarize_source
from damnit_api.shared.settings import MetadataSettings
from damnit_api.shared.settings import settings as app_settings


def _shot(fired_at: str, **extra):
    return {"source_key": "new", "shot_number": 1, "fired_at": fired_at, **extra}


def _event(match_status: str, *, acknowledged: bool = False):
    return {
        "event_id": f"{match_status}-{acknowledged}",
        "experiment_id": "new",
        "source": "watchdog",
        "kind": "file",
        "timestamp": "2026-11-21T09:00:00Z",
        "match_status": match_status,
        "acknowledged": acknowledged,
    }


SOURCE = {
    "key": "new",
    "title": "HZDR canonical campaign (Target_Alignment_11.2026)",
    "damnit_path": "/data/new",
    "metadata": {"experiment_id": "Target_Alignment_11.2026"},
    "shots": [
        _shot("2026-11-20T09:00:00Z", metadata={"status": "needs-review"}),
        _shot("2026-11-21T08:00:00+01:00", metadata={"status": "revision-needed"}),
        _shot("2026-11-21T10:00:00", experiment_id_source="unassigned"),
        _shot("not a time"),
        _shot(""),
    ],
    "review_events": [
        _event("ambiguous"),
        _event("unmatched"),
        _event("unmatched", acknowledged=True),
    ],
}

BERLIN_MIDNIGHT = datetime(2026, 11, 21, tzinfo=timezone(timedelta(hours=1)))


def test_summary_counts_what_home_shows():
    summary = summarize_source(HZDRSource.model_validate(SOURCE), BERLIN_MIDNIGHT)
    assert summary.shot_count == 5
    assert summary.latest_shot_number == 1
    assert summary.experiment_id == "Target_Alignment_11.2026"
    # The naive 10:00 is read in the zone of `since` and is the latest.
    assert summary.last_shot_at == "2026-11-21T10:00:00"
    assert summary.fired_since == 2
    # ambiguous + unacknowledged unmatched + one unassigned shot
    assert summary.waiting == 3
    assert summary.needs_review == 1
    assert summary.needs_revision == 1


def test_summary_without_since_counts_nothing_as_new():
    summary = summarize_source(HZDRSource.model_validate(SOURCE))
    assert summary.fired_since == 0
    assert summary.last_shot_at == "2026-11-21T10:00:00"


def test_summary_of_an_empty_campaign():
    summary = summarize_source(
        HZDRSource(key="e", title="Empty", damnit_path=Path("/e")),
        datetime(2026, 11, 21, tzinfo=UTC),
    )
    assert summary.shot_count == 0
    assert summary.latest_shot_number is None
    assert summary.experiment_id is None
    assert summary.last_shot_at is None
    assert summary.waiting == 0


@pytest.fixture
def client(tmp_path, monkeypatch):
    sources = tmp_path / "hzdr_sources.json"
    sources.write_bytes(orjson.dumps({"sources": [SOURCE]}))
    monkeypatch.setattr(
        app_settings,
        "metadata",
        MetadataSettings(provider="local", sources_file=sources),
    )
    app = FastAPI()
    app.include_router(hzdr_router)
    with TestClient(app) as test_client:
        yield test_client


def test_route_returns_counts_without_shots(client):
    response = client.get(
        "/metadata/hzdr/source-summaries",
        params={"since": "2026-11-21T00:00:00+01:00"},
    )
    assert response.status_code == 200
    (summary,) = response.json()
    assert "shots" not in summary
    assert "review_events" not in summary
    assert summary["key"] == "new"
    assert summary["fired_since"] == 2
    assert summary["waiting"] == 3


def test_route_rejects_a_malformed_since(client):
    response = client.get(
        "/metadata/hzdr/source-summaries", params={"since": "yesterday"}
    )
    assert response.status_code == 422


def test_a_pending_ruling_stops_an_unassigned_shot_waiting():
    summary = summarize_source(HZDRSource.model_validate(SOURCE), BERLIN_MIDNIGHT, {1})
    # ambiguous + unacknowledged unmatched; the unassigned shot 1 is ruled
    assert summary.waiting == 2


def test_unreadable_times_are_counted_not_hidden():
    summary = summarize_source(HZDRSource.model_validate(SOURCE), BERLIN_MIDNIGHT)
    # "not a time" is unreadable; an empty fired_at is just not recorded
    assert summary.unreadable_times == 1


def test_route_counts_a_ruling_written_beside_the_catalog(client, tmp_path):
    append_experiment_ruling(
        tmp_path / "hzdr_sources.json",
        shot_number=1,
        experiment_id="new",
        by="reviewer",
    )
    (summary,) = client.get("/metadata/hzdr/source-summaries").json()
    assert summary["waiting"] == 2
