import structlog


class DWError(Exception):
    """Base class for all DW errors."""

    message: str
    code: int | None
    details: str | dict | None
    request_id: str | None

    def __init__(self, message: str, *, details: str | None = None):
        super().__init__(message)
        self.message = message
        self.details = details
        self.request_id = structlog.contextvars.get_contextvars().get("request_id")


class ForbiddenError(DWError):
    """Error for forbidden access."""

    message: str = "Forbidden"
    code = 403
