import inspect
import logging
import sys
from typing import TYPE_CHECKING

import colorama
import structlog
import structlog.typing
import ulid
from starlette.middleware.base import BaseHTTPMiddleware
from structlog.dev import RichTracebackFormatter
from structlog.stdlib import ProcessorFormatter

if TYPE_CHECKING:  # pragma: no cover
    from starlette.requests import Request
    from starlette.responses import Response


def get_logger(logger_name: str | None = None):
    if logger_name:
        return structlog.get_logger(logger_name=logger_name)

    frame = inspect.currentframe()
    if frame is None or frame.f_back is None:
        return structlog.get_logger()

    caller_globals = frame.f_back.f_globals
    module_name = caller_globals.get("__name__")
    # filepath = caller_globals.get("__file__")
    # filepath_rel = (
    #     Path(filepath).relative_to(Path(__file__).parent) if filepath else None
    # )
    return structlog.get_logger(
        logger_name=module_name,
        # filepath=filepath_rel,
    )


def pretty_format_name_callsite(logger, method_name, event_dict):
    logger_name = event_dict.get("logger_name")

    if not logger_name or not logger_name.startswith("damnit_api."):
        return event_dict

    if func_name := event_dict.pop("func_name"):
        logger_name = f"{logger_name}.{func_name}"

    if lineno := event_dict.pop("lineno"):
        logger_name = f"{logger_name}:{lineno}"

    if logger_name.startswith("damnit_api.access_log"):
        return event_dict

    event_dict["logger_name"] = logger_name.strip(".")

    return event_dict


def request_id_at_front(logger, method_name, event_dict):
    request_id = event_dict.pop("request_id", None)
    if request_id is not None:
        event_dict = {"request_id": request_id, **event_dict}
    return event_dict


def configure(
    level: str | int | None = None,
    debug: bool | None = None,
    add_call_site_parameters: bool = False,
) -> None:
    """
    Configures logging and sets up Uvicorn to use Structlog.
    """

    from .shared.settings import settings

    debug = settings.debug if debug is None else debug
    level = settings.log_level if level is None else level

    if isinstance(level, str):
        level = logging.getLevelNamesMapping()[level.upper()]

    level_styles = structlog.dev.ConsoleRenderer.get_default_level_styles()

    if debug:
        level_styles["debug"] = colorama.Fore.MAGENTA

    renderer: structlog.typing.Processor = (
        structlog.dev.ConsoleRenderer(
            colors=True,
            level_styles=level_styles,
            sort_keys=False,
            exception_formatter=RichTracebackFormatter(max_frames=1),
        )  # type: ignore[assignment]
        if debug
        else structlog.processors.JSONRenderer(indent=1)
    )

    # sentry_processor = sentry.SentryProcessor(level=level)

    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="%Y-%m-%dT%H:%M:%SZ", utc=True),
        request_id_at_front,
    ]

    if add_call_site_parameters:
        shared_processors.extend([
            structlog.processors.CallsiteParameterAdder({
                structlog.processors.CallsiteParameter.FUNC_NAME,
                structlog.processors.CallsiteParameter.LINENO,
            }),  # type: ignore[arg-type]
            pretty_format_name_callsite,
        ])

    structlog_processors = [*shared_processors, renderer]
    logging_processors = [ProcessorFormatter.remove_processors_meta, renderer]

    # if sentry.SENTRY_ENABLED:
    #     processors.append(sentry_processor)

    formatter = ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=logging_processors,
    )

    structlog.configure(
        processors=structlog_processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        # logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
        context_class=dict,
    )

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)
    logging.basicConfig(handlers=[handler], level=logging.INFO)

    configure_uvicorn(renderer, shared_processors)

    log = structlog.get_logger()
    log.info(
        "Configured Logging",
        call_site_parameters=add_call_site_parameters,
        log_level=logging.getLevelName(level),
    )


def configure_uvicorn(renderer, shared_processors):
    import uvicorn.config

    uvicorn.config.LOGGING_CONFIG["formatters"]["default"] = {
        "()": structlog.stdlib.ProcessorFormatter,
        "processor": renderer,
        "foreign_pre_chain": shared_processors,
    }

    uvicorn.config.LOGGING_CONFIG["handlers"]["default"] = {
        "class": "logging.StreamHandler",
        "formatter": "default",
    }

    uvicorn.config.LOGGING_CONFIG["root"] = {
        "level": logging.INFO,
        "handlers": ["default"],
    }

    # Disabled access log handlers as they are handled by the middleware
    uvicorn.config.LOGGING_CONFIG["loggers"]["uvicorn.access"]["handlers"] = []
    uvicorn.config.LOGGING_CONFIG["loggers"]["uvicorn.access"]["propagate"] = False


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    _logger = None

    @property
    def logger(self):
        if not self._logger:
            self._logger = structlog.get_logger(logger_name="damnit_api.access_log")

        return self._logger

    async def dispatch(self, request: "Request", call_next) -> "Response":
        """Add a middleware to FastAPI that will log requests and responses,
        this is used instead of the builtin Uvicorn access logging to better
        integrate with structlog"""

        structlog.contextvars.bind_contextvars(request_id=str(ulid.ULID()))

        info = {
            "method": request.method,
            "path": request.scope["path"],
            "client": request.client,
        }

        if request.query_params:
            info["query_params"] = str(request.query_params)

        if request.path_params:
            info["path_params"] = str(request.path_params)

        logger = self.logger.bind()

        logger.info("Request", **info)

        response = await call_next(request)

        if response.status_code < 400:
            response_logger = logger.info
        elif response.status_code < 500:
            response_logger = logger.warn
        else:
            response_logger = logger.error

        # Health checks are noisy, so we downgrade their log level
        if request.url.path.endswith("/health"):
            response_logger = logger.debug

        response_logger("Response", status_code=response.status_code)

        return response
