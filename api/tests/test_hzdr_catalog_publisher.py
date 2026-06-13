import importlib.util
import json
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "publish-hzdr-catalog.py"
SPEC = importlib.util.spec_from_file_location("publish_hzdr_catalog", SCRIPT_PATH)
assert SPEC is not None
publish_hzdr_catalog = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["publish_hzdr_catalog"] = publish_hzdr_catalog
SPEC.loader.exec_module(publish_hzdr_catalog)


class FakeResponse:
    def __init__(self, status_code: int, body: dict):
        self.status_code = status_code
        self._body = body
        self.text = json.dumps(body)

    def json(self):
        return self._body


class FakeSession:
    def __init__(self, responses: list[FakeResponse]):
        self.responses = responses
        self.requests = []

    def post(self, url, *, json, timeout):
        self.requests.append({"url": url, "json": json, "timeout": timeout})
        return self.responses.pop(0)


def test_build_damnit_catalog_payload_uses_hdf5_and_status():
    source = {
        "key": "hzdr-emulator",
        "title": "HZDR emulator",
        "metadata": {"facility": "HZDR", "experiment_id": "exp-test"},
    }
    shot = {
        "shot_number": 123,
        "fired_at": "2026-05-22T08:30:00Z",
        "hdf5_path": "/data/exp-test.h5",
        "metadata": {
            "experiment_id": "exp-test",
            "shot_id": "shot-000123",
            "status": "processed",
        },
    }

    payload = publish_hzdr_catalog.build_damnit_catalog_payload(source, shot)

    assert payload["schema"] == "damnit-web-hzdr.catalog.v1"
    assert payload["dataset"]["filepath"] == "/data/exp-test.h5"
    assert payload["dataset"]["meta"]["damnit"]["review_status"] == "processed"
    assert payload["shot"]["shot_id"] == "shot-000123"


def test_default_sources_file_points_to_repo_generated_dir():
    expected = (
        SCRIPT_PATH.parents[2]
        / ".generated"
        / "hzdr-package-emulator"
        / "hzdr_sources.json"
    )

    assert expected == publish_hzdr_catalog.DEFAULT_SOURCES_FILE


def test_publish_payload_auto_falls_back_to_from_json():
    session = FakeSession([
        FakeResponse(404, {"detail": "missing"}),
        FakeResponse(200, {"ok": True, "pid": "pid-1"}),
    ])
    payload = publish_hzdr_catalog.build_damnit_catalog_payload(
        {"key": "hzdr", "title": "HZDR"},
        {
            "shot_number": 7,
            "hdf5_path": "/data/shot.h5",
            "metadata": {"experiment_id": "exp", "shot_id": "shot-000007"},
        },
    )

    result = publish_hzdr_catalog.publish_payload(
        "http://127.0.0.1:5001",
        payload,
        session=session,
    )

    assert result.endpoint == "from-json"
    assert session.requests[0]["url"].endswith("/scicat/from-damnit")
    assert session.requests[1]["url"].endswith("/scicat/from-json")
    assert session.requests[1]["json"]["filepath"] == "/data/shot.h5"
    assert session.requests[1]["json"]["type"] == "raw"
