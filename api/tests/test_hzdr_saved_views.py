from pathlib import Path

import orjson
from fastapi.testclient import TestClient

from damnit_api.auth import models
from damnit_api.main import create_app
from damnit_api.shared.settings import settings


def write_sources_file(tmp_path: Path) -> Path:
    path = tmp_path / "hzdr_sources.json"
    path.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": "hzdr-a",
                    "title": "HZDR A",
                    "damnit_path": "damnit/hzdr-a",
                    "metadata": {},
                    "shots": [],
                },
                {
                    "key": "hzdr-b",
                    "title": "HZDR B",
                    "damnit_path": "damnit/hzdr-b",
                    "metadata": {},
                    "shots": [],
                },
            ]
        })
    )
    return path


def configure_local_sources(monkeypatch, sources_file: Path) -> None:
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)


def make_user(username: str) -> models.OAuthUserInfo:
    return models.OAuthUserInfo(
        email=f"{username}@localhost",
        family_name="User",
        given_name=username,
        groups=[],
        name=username,
        preferred_username=username,
    )


def login(client: TestClient) -> None:
    response = client.get("/oauth/login?redirect_uri=/home", follow_redirects=False)
    assert response.status_code == 307


def test_hzdr_saved_views_require_login(tmp_path: Path, monkeypatch):
    configure_local_sources(monkeypatch, write_sources_file(tmp_path))

    with TestClient(create_app(), follow_redirects=False) as client:
        response = client.get("/metadata/hzdr/sources/hzdr-a/views")

    assert response.status_code == 401


def test_hzdr_saved_views_create_list_replace_and_delete(tmp_path: Path, monkeypatch):
    sources_file = write_sources_file(tmp_path)
    configure_local_sources(monkeypatch, sources_file)

    with TestClient(create_app(), follow_redirects=False) as client:
        login(client)
        created = client.post(
            "/metadata/hzdr/sources/hzdr-a/views",
            json={
                "name": "Default",
                "state": {
                    "variable_visibility": {"laser_energy": True, "pressure": False},
                    "tag_selection": {"diagnostics": True},
                },
            },
        )
        assert created.status_code == 200
        payload = created.json()
        assert payload["id"].startswith("view_")
        assert payload["owner"] == "hzdr-dev"
        assert payload["scope"] == "personal"

        replaced = client.post(
            "/metadata/hzdr/sources/hzdr-a/views",
            json={
                "name": "Default",
                "state": {"variable_visibility": {"pressure": True}},
            },
        )
        assert replaced.status_code == 200
        assert replaced.json()["id"] == payload["id"]
        assert replaced.json()["state"] == {"variable_visibility": {"pressure": True}}

        listed = client.get("/metadata/hzdr/sources/hzdr-a/views")
        assert listed.status_code == 200
        assert [view["name"] for view in listed.json()] == ["Default"]

        sidecar = sources_file.with_name("hzdr_sources.views.json")
        assert sidecar.exists()
        sidecar_payload = orjson.loads(sidecar.read_bytes())
        assert sidecar_payload["version"] == 1
        assert sidecar_payload["views"][0]["source_key"] == "hzdr-a"

        deleted = client.delete(f"/metadata/hzdr/sources/hzdr-a/views/{payload['id']}")
        assert deleted.status_code == 200
        assert deleted.json() == {"deleted": True}
        assert client.get("/metadata/hzdr/sources/hzdr-a/views").json() == []


def test_hzdr_saved_views_are_source_scoped(tmp_path: Path, monkeypatch):
    configure_local_sources(monkeypatch, write_sources_file(tmp_path))

    with TestClient(create_app(), follow_redirects=False) as client:
        login(client)
        for source_key in ("hzdr-a", "hzdr-b"):
            response = client.post(
                f"/metadata/hzdr/sources/{source_key}/views",
                json={"name": "Default", "state": {"source": source_key}},
            )
            assert response.status_code == 200

        a_views = client.get("/metadata/hzdr/sources/hzdr-a/views").json()
        b_views = client.get("/metadata/hzdr/sources/hzdr-b/views").json()

    assert len(a_views) == 1
    assert len(b_views) == 1
    assert a_views[0]["id"] != b_views[0]["id"]
    assert a_views[0]["state"] == {"source": "hzdr-a"}
    assert b_views[0]["state"] == {"source": "hzdr-b"}


def test_hzdr_saved_views_allow_same_name_for_two_users(tmp_path: Path, monkeypatch):
    configure_local_sources(monkeypatch, write_sources_file(tmp_path))
    app = create_app()

    with TestClient(app, follow_redirects=False) as client:
        for username in ("ada", "grace"):
            app.dependency_overrides[models.OAuthUserInfo.from_connection] = (
                lambda username=username: make_user(username)
            )
            response = client.post(
                "/metadata/hzdr/sources/hzdr-a/views",
                json={"name": "Default", "state": {"owner": username}},
            )
            assert response.status_code == 200

        app.dependency_overrides[models.OAuthUserInfo.from_connection] = lambda: (
            make_user("ada")
        )
        ada_views = client.get("/metadata/hzdr/sources/hzdr-a/views").json()
        app.dependency_overrides[models.OAuthUserInfo.from_connection] = lambda: (
            make_user("grace")
        )
        grace_views = client.get("/metadata/hzdr/sources/hzdr-a/views").json()

    assert [view["name"] for view in ada_views] == ["Default"]
    assert [view["name"] for view in grace_views] == ["Default"]
    assert ada_views[0]["id"] != grace_views[0]["id"]
    assert ada_views[0]["state"] == {"owner": "ada"}
    assert grace_views[0]["state"] == {"owner": "grace"}
