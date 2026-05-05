from fastapi.testclient import TestClient

from damnit_api.main import create_app


def test_root_redirects_to_docs():
    """Opening the API root should not look like a broken dev server."""
    with TestClient(create_app(), follow_redirects=False) as client:
        response = client.get("/")

    assert response.status_code == 307
    assert response.headers["location"] == "/docs"


def test_runtime_config_defaults_to_hzdr_terms():
    """HZDR/local deployments should expose source terminology to clients."""
    with TestClient(create_app()) as client:
        response = client.get("/config/runtime")

    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"] == "hzdr"
    assert payload["metadata_provider"] == "local"
    assert payload["terminology"]["identity_label"] == "Source"
    assert payload["terminology"]["uses_proposals"] is False
    assert payload["terminology"]["uses_mymdc"] is False
