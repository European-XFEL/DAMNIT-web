from fastapi.testclient import TestClient

from damnit_api.main import create_app
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

    flow_monitor = Settings(damnit_path=".").flow_monitor

    assert [option.value for option in flow_monitor.producers.shotcounter.tkeys] == [
        "custom01"
    ]
    assert [option.value for option in flow_monitor.producers.watchdog.watchers] == [
        "custom-watcher"
    ]
    assert flow_monitor.producers.mongo.updates_damnit_sqlite is True
    # Producer settings not mentioned in the environment keep their defaults.
    assert flow_monitor.producers.laser_data.enabled is True
