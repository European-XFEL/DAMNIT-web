import asyncio
import sys
import time
import types
from pathlib import Path

from fastapi.testclient import TestClient

from damnit_api.main import create_app
from damnit_api.shared import routers
from damnit_api.shared.settings import Settings, settings


def test_root_redirects_to_docs():
    """Opening the API root should not look like a broken dev server."""
    with TestClient(create_app(), follow_redirects=False) as client:
        response = client.get("/")

    assert response.status_code == 307
    assert response.headers["location"] == "/docs"


def test_runtime_config_defaults_to_hzdr_terms(monkeypatch):
    """HZDR/local deployments should expose source terminology to clients.

    Pin metadata_provider and auth on the live settings singleton rather than
    relying on whatever api/.env happens to set locally (e.g. "mongo" for
    labfrog-style dev, or no .env at all if pytest runs from a different cwd
    - see test_runtime_config_reports_none_auth_mode_in_offline_local_mode)
    - create_app() does not re-read environment variables into the
    already-constructed settings object, so monkeypatch.setenv alone would
    not isolate this test from the environment it happens to run in.
    """
    from damnit_api.shared.settings import AuthSettings

    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="ldap"))

    with TestClient(create_app()) as client:
        response = client.get("/config/runtime")

    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"] in {"hzdr", "hzdr-test"}
    assert payload["auth_mode"] == "ldap"
    assert payload["ldap_form_enabled"] is False
    assert payload["metadata_provider"] == "local"
    assert payload["flow_monitor"]["receivers"] == {
        "laser_data": True,
        "watchdog": True,
        "mongo": True,
    }
    producers = payload["flow_monitor"]["producers"]
    assert producers["shotcounter"]["enabled"] is True
    assert {option["value"] for option in producers["shotcounter"]["tkeys"]} == {
        "draco01",
        "draco02",
        "draco04",
        "draco07",
        "draco08",
    }
    assert producers["laser_data"]["enabled"] is True
    assert producers["watchdog"]["enabled"] is True
    assert {option["value"] for option in producers["watchdog"]["watchers"]} == {
        "png-originals",
        "dummy-analysis",
        "lli-parser",
        "tps-quick",
    }
    assert producers["mongo"] == {"enabled": True, "updates_damnit_sqlite": False}
    assert payload["terminology"]["identity_label"] == "Source"
    assert payload["terminology"]["uses_proposals"] is False
    assert payload["terminology"]["uses_mymdc"] is False


def test_runtime_config_reports_live_traffic_when_a_spool_consumer_runs(
    monkeypatch,
):
    """The flow monitor opens in Live mode when real traffic is configured."""
    monkeypatch.setattr(settings.hzdr_spool, "enabled", False)
    monkeypatch.setattr(settings.hzdr_kafka_spool, "enabled", False)
    with TestClient(create_app()) as client:
        payload = client.get("/config/runtime").json()
    assert payload["flow_monitor"]["live_traffic"] is False

    # Only the response is under test; the lifespan (which would start the
    # consumer) has already run with the consumer off.
    with TestClient(create_app()) as client:
        monkeypatch.setattr(settings.hzdr_kafka_spool, "enabled", True)
        payload = client.get("/config/runtime").json()
    assert payload["flow_monitor"]["live_traffic"] is True


def test_runtime_config_reports_configured_ldap_form(monkeypatch):
    """The frontend needs to know when it should show the LDAP login form.

    Builds a fresh AuthSettings rather than mutating settings.auth's
    attributes in place: settings.auth is None in true local/offline mode
    (no DW_API_AUTH__* env at all), and this test must hold regardless of
    what mode the environment running it happens to be in.
    """
    from damnit_api.shared.settings import AuthSettings, LDAPSettings

    monkeypatch.setattr(
        settings,
        "auth",
        AuthSettings(mode="ldap", ldap=LDAPSettings(server_url="ldap://localhost")),
    )

    with TestClient(create_app()) as client:
        response = client.get("/config/runtime")

    assert response.status_code == 200
    payload = response.json()
    assert payload["auth_mode"] == "ldap"
    assert payload["ldap_form_enabled"] is True


def test_runtime_config_reports_none_auth_mode_in_offline_local_mode(monkeypatch):
    """True local/offline mode (no auth config at all) must not 500."""
    monkeypatch.setattr(settings, "auth", None)

    with TestClient(create_app()) as client:
        response = client.get("/config/runtime")

    assert response.status_code == 200
    payload = response.json()
    assert payload["auth_mode"] == "none"
    assert payload["ldap_form_enabled"] is False


def test_flow_monitor_producer_options_overridable_via_env(monkeypatch):
    """Operators can replace a producer's option list with one .env JSON value.

    DW_API_FLOW_MONITOR__PRODUCERS__SHOTCOUNTER__TKEYS (etc.) takes a JSON
    list of {value, label, description} objects - the same shape
    GET /config/runtime reports - so the Flow Monitor's selectable
    TKEYs/watcher rules can be edited in one place (.env) instead of being
    hard-coded in the frontend.
    """
    monkeypatch.setenv(
        "DW_API_FLOW_MONITOR__PRODUCERS__SHOTCOUNTER__TKEYS",
        '[{"value": "custom01", "label": "Custom01"}]',
    )
    monkeypatch.setenv(
        "DW_API_FLOW_MONITOR__PRODUCERS__WATCHDOG__WATCHERS",
        '[{"value": "custom-watcher", "label": "Custom watcher", '
        '"description": "site-specific rule"}]',
    )
    monkeypatch.setenv(
        "DW_API_FLOW_MONITOR__PRODUCERS__MONGO__UPDATES_DAMNIT_SQLITE", "true"
    )

    flow_monitor = Settings(damnit_path=Path()).flow_monitor

    assert [option.value for option in flow_monitor.producers.shotcounter.tkeys] == [
        "custom01"
    ]
    assert [option.value for option in flow_monitor.producers.watchdog.watchers] == [
        "custom-watcher"
    ]
    assert flow_monitor.producers.mongo.updates_damnit_sqlite is True
    # Producer settings not mentioned in the environment keep their defaults.
    assert flow_monitor.producers.laser_data.enabled is True


def test_health_first_call_reports_reachable_kafka_despite_slow_mongo_setup(
    monkeypatch,
):
    """A slow, blocking Mongo client set-up must not starve the Kafka probe.

    On fwkt-webapps (2026-10-02) the first /config/health after a restart said
    Kafka was unreachable and the second said it was fine: the Mongo probe's
    synchronous first-time work (importing motor, building the client) ran on
    the event loop and outlasted the concurrent Kafka probe's timeout.
    """
    probe_timeout = 0.3

    class SlowClient:
        def __init__(self, uri, **kwargs):
            time.sleep(probe_timeout * 3)  # blocking, like a cold import
            self.admin = self

        async def command(self, name):
            return {"ok": 1}

        def close(self):
            pass

    fake_motor = types.ModuleType("motor")
    fake_motor_asyncio = types.ModuleType("motor.motor_asyncio")
    fake_motor_asyncio.AsyncIOMotorClient = SlowClient
    fake_motor.motor_asyncio = fake_motor_asyncio
    monkeypatch.setitem(sys.modules, "motor", fake_motor)
    monkeypatch.setitem(sys.modules, "motor.motor_asyncio", fake_motor_asyncio)

    async def fake_asapo(url, probe_timeout):
        await asyncio.sleep(0)
        return routers.ServiceHealth(reachable=True, latency_ms=0)

    monkeypatch.setattr(routers, "_probe_asapo", fake_asapo)

    async def run():
        server = await asyncio.start_server(
            lambda reader, writer: writer.close(), "127.0.0.1", 0
        )
        port = server.sockets[0].getsockname()[1]
        monkeypatch.setattr(
            settings,
            "hzdr_health",
            types.SimpleNamespace(
                asapo_status_url="http://unused",
                kafka_bootstrap=f"127.0.0.1:{port}",
                mongo_uri="mongodb://unused",
                timeout=probe_timeout,
            ),
        )
        try:
            return await routers.get_flow_monitor_health()
        finally:
            server.close()
            await server.wait_closed()

    health = asyncio.run(run())

    assert health.kafka.reachable is True, health.kafka.detail
    assert health.mongo.reachable is True
