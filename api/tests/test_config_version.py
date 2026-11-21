"""GET /config/version: the package version and the commit at start-up."""

import subprocess  # noqa: S404 -- git rev-parse, fixed arguments

from fastapi import FastAPI
from fastapi.testclient import TestClient

from damnit_api.shared import routers


def _client():
    app = FastAPI()
    app.include_router(routers.router)
    return TestClient(app)


def test_version_reports_the_running_package_and_commit():
    with _client() as client:
        payload = client.get("/config/version").json()
    assert payload["version"] == routers._package_version()
    head = subprocess.run(
        ["git", "rev-parse", "--short=12", "HEAD"],  # noqa: S607
        cwd=routers.__file__.rsplit("/", 1)[0],
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    assert payload["commit"] == (head or None)


def test_no_git_means_no_commit(monkeypatch):
    def missing(*args, **kwargs):
        message = "git"
        raise FileNotFoundError(message)

    monkeypatch.setattr(routers.subprocess, "run", missing)
    assert routers._checkout_commit() is None
