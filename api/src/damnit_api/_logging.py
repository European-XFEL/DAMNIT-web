import logging
import sys
from typing import TYPE_CHECKING

import colorama
import structlog
import structlog.typing
from starlette.middleware.base import BaseHTTPMiddleware
from structlog.stdlib import ProcessorFormatter

if TYPE_CHECKING:  # pragma: no cover
    from starlette.requests import Request
    from starlette.responses import Response


def logger_name_callsite(logger, method_name, event_dict):
    if not event_dict.get("logger_name"):
        logger_name = f"{event_dict.pop('module')}.{event_dict.pop('func_name')}"
        if not event_dict.pop("disable_name", False):
            event_dict["logger_name"] = logger_name.strip(".")  # pyright: ignore[reportInvalidTypeForm]

    return event_dict


def configure(
    level: str | int | None = None,
    debug: bool | None = None,
    add_call_site_parameters: bool = False,
):
    configure_structlog(level, debug, add_call_site_parameters)


def configure_structlog(
    level: str | int | None = None,
    debug: bool | None = None,
    add_call_site_parameters: bool = False,
) -> None:
    """
    Configures logging and sets up Uvicorn to use Structlog.
    """

    from .settings import settings

    debug = settings.debug if debug is None else debug
    level = settings.log_level if level is None else level

    if isinstance(level, str):
        level = logging.getLevelNamesMapping()[level.upper()]

    level_styles = structlog.dev.ConsoleRenderer.get_default_level_styles()

    if debug:
        level_styles["debug"] = colorama.Fore.MAGENTA

    renderer: structlog.typing.Processor = (
        structlog.dev.ConsoleRenderer(colors=True, level_styles=level_styles)  # type: ignore[assignment]
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
    ]

    if add_call_site_parameters:
        shared_processors.extend([
            structlog.processors.CallsiteParameterAdder({
                structlog.processors.CallsiteParameter.MODULE,
                structlog.processors.CallsiteParameter.FUNC_NAME,
            }),  # type: ignore[arg-type]
            logger_name_callsite,
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
        logger_factory=structlog.PrintLoggerFactory(sys.stderr),
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


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    _logger = None

    @property
    def logger(self):
        if not self._logger:
            self._logger = structlog.get_logger(disable_name=True)

        return self._logger

    async def dispatch(self, request: "Request", call_next) -> "Response":
        """Add a middleware to FastAPI that will log requests and responses,
        this is used instead of the builtin Uvicorn access logging to better
        integrate with structlog"""
        info = {
            "method": request.method,
            "path": request.scope["path"],
            "client": request.client,
        }

        if request.query_params:
            info["query_params"] = str(request.query_params)

        if request.path_params:
            info["path_params"] = str(request.path_params)

        logger = self.logger.bind(path=request.scope["path"], method=request.method)
        logger.debug("Request", **info)

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
