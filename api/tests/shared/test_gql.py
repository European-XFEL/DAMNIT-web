from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlmodel import SQLModel
from starlette.websockets import WebSocketDisconnect

import damnit_api._db
from damnit_api._mymdc.clients import MyMdCClientMock
from damnit_api._mymdc.ports import MyMdCPort
from damnit_api.auth.models import OAuthUserInfo
from damnit_api.main import create_app
from damnit_api.metadata import models  # noqa: F401 - registers the tables
from damnit_api.shared.settings import settings

# Each TestClient runs the app in a loop of its own, so the MyMdC port's
# alru_caches, bound to an earlier loop, warn as they reset.
pytestmark = pytest.mark.filterwarnings("ignore::async_lru.AlruCacheLoopResetWarning")

MYMDC_CASSETTE = Path(__file__).parent.parent / "mock" / "mymdc" / "mymdc.yaml"

USER = OAuthUserInfo(
    email="e2e-tester@example.org",
    family_name="Tester",
    given_name="E2e",
    name="E2e Tester",
    preferred_username="e2etester",
)


@pytest.fixture
def fresh_app_db(monkeypatch, tmp_path):
    """The app opens an empty database of its own, not the dev `dw_api.sqlite`."""
    db_path = tmp_path / "dw_api.sqlite"
    SQLModel.metadata.create_all(create_engine(f"sqlite:///{db_path}"))
    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(damnit_api._db, "__ENGINE", None)
    monkeypatch.setattr(damnit_api._db, "__SESSION_LOCAL", None)


@pytest.fixture
def mymdc_down(mocker):
    """MyMdC refuses the user's proposal list until the test stops this patch."""
    return mocker.patch.object(
        MyMdCClientMock,
        "_get_user_proposals",
        side_effect=httpx.ConnectError("Connection refused"),
    )


@pytest.fixture
def app(monkeypatch, fresh_app_db):
    async def noop_bootstrap(_settings):
        pass

    monkeypatch.setattr("damnit_api.auth.bootstrap", noop_bootstrap)
    monkeypatch.setattr("damnit_api._mymdc.bootstrap", noop_bootstrap)
    # Local mode answers `get_user` without asking MyMdC.
    monkeypatch.setattr(settings, "damnit_path", None)

    mymdc = MyMdCClientMock(cassette_file=MYMDC_CASSETTE)
    app = create_app()
    app.dependency_overrides[OAuthUserInfo.from_connection] = lambda: USER
    app.dependency_overrides[MyMdCPort.from_global] = lambda: mymdc

    return app


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client

        # The app never disposes its engine, whose connections need this loop.
        client.portal.call(damnit_api._db.__ENGINE.dispose)  # pyright: ignore[reportOptionalMemberAccess]


def start_live_updates(client):
    """Send the handshake the browser sends, and return the server's answer."""
    with client.websocket_connect(
        "/graphql", subprotocols=["graphql-transport-ws"]
    ) as websocket:
        websocket.send_json({"type": "connection_init"})
        return websocket.receive_json()


def test_a_handshake_is_rejected_for_a_retry_while_mymdc_fails(client, mymdc_down):
    with pytest.raises(WebSocketDisconnect) as closed:
        start_live_updates(client)

    # graphql-ws retries a 4403 close with its back-off.
    assert closed.value.code == 4403


def test_a_retried_handshake_is_acknowledged_once_mymdc_answers(
    client, mocker, mymdc_down
):
    # MyMdC is down
    with pytest.raises(WebSocketDisconnect):
        start_live_updates(client)

    # MyMdC answers again
    mocker.stop(mymdc_down)
    assert start_live_updates(client) == {"type": "connection_ack"}
