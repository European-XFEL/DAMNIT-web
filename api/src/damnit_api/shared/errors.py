"""Shared error classes for the DW API.

Application code raises `DWError` subclasses for any failure that can reach a client.

Any other exceptions will become a 500/internal errors.
"""

import structlog


class DWError(Exception):
    """Base class for all DW errors.

    Subclasses set `code` to the HTTP status code that best describes the failure.

    `request_id` is captured from structlog contextvars at raise time, so it's easily
    available to the exception handler.
    """

    code: int = 500
    message: str
    details: str | dict | None
    request_id: str | None

    def __init__(self, message: str, *, details: str | dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details
        self.request_id = structlog.contextvars.get_contextvars().get("request_id")


class InvalidInputError(DWError):
    """Error for malformed or invalid caller input."""

    code = 400


class UnauthenticatedError(DWError):
    """Error for missing or invalid authentication."""

    code = 401


class ForbiddenError(DWError):
    """Error for forbidden access."""

    message: str = "Forbidden"
    code = 403


class NotFoundError(DWError):
    """Error for a resource that does not exist."""

    code = 404


class ProposalNotFoundError(NotFoundError):
    """Error for a proposal number that does not exist or is not resolvable."""


class UpstreamServiceError(DWError):
    """Error for a failure in an upstream service (MyMdC, OIDC provider)."""

    code = 502


class DataUnavailableError(DWError):
    """Error for data that is temporarily unreadable.

    E.g. GPFS timeouts, unreadable runs.sqlite.
    """

    code = 503
