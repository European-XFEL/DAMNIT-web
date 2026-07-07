"""Unit tests for the DamnitWebError hierarchy (ADR-001)."""

import pytest
import structlog
from fastapi.testclient import TestClient

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
# FastAPI exception handler


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("DW_API_AUTH__CLIENT_ID", "test")
    monkeypatch.setenv("DW_API_AUTH__CLIENT_SECRET", "test")
    monkeypatch.setenv(
        "DW_API_AUTH__SERVER_METADATA_URL", "https://example.com/.well-known"
    )
    monkeypatch.setenv("DW_API_SESSION_SECRET", "test")

    # No OAuth client: skips the OIDC metadata fetch at startup; these tests
    # never exercise the oauth routes.
    monkeypatch.setattr("damnit_api.state.create_oauth_client", lambda settings: None)

    app = create_app()
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
def client(app):
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.mark.parametrize(
    ("exc_class", "expected_status"),
    [
        (ForbiddenError, 403),
        (ProposalNotFoundError, 404),
        (UpstreamServiceError, 502),
    ],
)
def test_handler_maps_dwerror_to_status_code(app, client, exc_class, expected_status):
    @app.get("/__test_raise__")
    def _raise():
        msg = "boom"
        raise exc_class(msg, details="extra")

    resp = client.get("/__test_raise__")

    assert resp.status_code == expected_status
    body = resp.json()
    assert body["message"] == "boom"
    assert body["details"] == "extra"
