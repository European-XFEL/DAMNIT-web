"""Unit tests for the DamnitWebError hierarchy (ADR-001)."""

import pytest
import structlog
from litestar import get
from litestar.testing import TestClient

from damnit_api.main import create_app
from damnit_api.shared.errors import (
    DamnitWebError,
    DataUnavailableError,
    ForbiddenError,
    InvalidInputError,
    NotFoundError,
    ProposalNotFoundError,
    UnauthenticatedError,
    UpstreamServiceError,
)

# -----------------------------------------------------------------------------
# code attributes


@pytest.mark.parametrize(
    ("exc_class", "expected_code"),
    [
        (DamnitWebError, 500),
        (InvalidInputError, 400),
        (UnauthenticatedError, 401),
        (ForbiddenError, 403),
        (NotFoundError, 404),
        (ProposalNotFoundError, 404),
        (UpstreamServiceError, 502),
        (DataUnavailableError, 503),
    ],
)
def test_code_attribute(exc_class, expected_code):
    assert exc_class.code == expected_code
    assert exc_class("boom").code == expected_code


# -----------------------------------------------------------------------------
# inheritance


def test_proposal_not_found_is_not_found():
    assert issubclass(ProposalNotFoundError, NotFoundError)


# -----------------------------------------------------------------------------
# message / details / request_id capture


def test_message_and_details_captured():
    exc = InvalidInputError("bad input", details={"field": "proposal_number"})
    assert exc.message == "bad input"
    assert exc.details == {"field": "proposal_number"}
    assert str(exc) == "bad input"


def test_details_defaults_to_none():
    exc = NotFoundError("missing")
    assert exc.details is None


def test_request_id_captured_from_contextvars():
    with structlog.contextvars.bound_contextvars(request_id="req-123"):
        exc = UpstreamServiceError("mymdc unreachable")
    assert exc.request_id == "req-123"


def test_request_id_none_when_not_bound():
    structlog.contextvars.clear_contextvars()
    exc = DataUnavailableError("gpfs timeout")
    assert exc.request_id is None


# -----------------------------------------------------------------------------
# Litestar exception handler


@pytest.fixture
def app(monkeypatch):
    # AppState is built in the lifespan; stub the only startup step that
    # does network I/O (OIDC discovery).
    async def noop_load(self):
        pass

    monkeypatch.setattr(
        "damnit_api.auth.oauth.OAuthClient.load_server_metadata", noop_load
    )

    return create_app()


@pytest.mark.parametrize(
    ("exc_class", "expected_status"),
    [
        (ForbiddenError, 403),
        (ProposalNotFoundError, 404),
        (UpstreamServiceError, 502),
    ],
)
def test_handler_maps_dwerror_to_status_code(app, exc_class, expected_status):
    @get("/__test_raise__", sync_to_thread=False)
    def _raise() -> None:
        msg = "boom"
        raise exc_class(msg, details="extra")

    app.register(_raise)

    with TestClient(app) as client:
        resp = client.get("/__test_raise__")

    assert resp.status_code == expected_status
    body = resp.json()
    assert body["message"] == "boom"
    assert body["details"] == "extra"
