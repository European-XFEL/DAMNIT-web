import asyncio
import contextlib
from asyncio import TaskGroup
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

from ._logging import RequestLoggingMiddleware

# Known paths are redirected to the login page and
# then back after successful authentication.
KNOWN_PATHS = ["/graphql"]


def create_app():  # noqa: C901
    from . import _db, _logging, _mymdc, auth, contextfile, get_logger, metadata
    from .shared import errors, gql
    from .shared import routers as shared_routers
    from .shared.settings import settings

    logger = get_logger("lifespan")

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # noqa: C901
        _logging.configure(
            level=settings.log_level,
            debug=settings.debug,
            add_call_site_parameters=True,
        )

        logger.info("Starting application lifespan")

        bootstraps = [auth.bootstrap, _db.bootstrap]
        if settings.metadata.provider == "mymdc":
            bootstraps.append(_mymdc.bootstrap)
        async with TaskGroup() as tg:
            for bs in bootstraps:
                tg.create_task(bs(settings))

        if settings.auth is None or settings.auth.is_disabled:
            app.router.include_router(auth.noauth_router)
        else:
            app.router.include_router(auth.router)
        app.router.include_router(auth.ldap_router)
        app.router.include_router(metadata.router)
        app.router.include_router(contextfile.router)
        app.router.include_router(shared_routers.router)
        app.router.include_router(gql.get_gql_app(), prefix="/graphql")

        spool_root = settings.damnit_path or Path.cwd()
        spool_stop = asyncio.Event()
        spool_consumers = []
        spool_tasks = []
        # ASAPO spool writes events.jsonl (--events-jsonl); Kafka spool writes
        # trigger.jsonl (--trigger-jsonl).  Collected here so the optional builder
        # auto-trigger reruns the builder against exactly the running spool files.
        builder_events_jsonl = []
        builder_trigger_jsonl = []
        if settings.hzdr_spool.enabled:
            from .consumer.asapo import AsapoSpoolConsumer

            asapo_consumer = AsapoSpoolConsumer.from_settings(spool_root)
            spool_consumers.append(asapo_consumer)
            builder_events_jsonl.append(asapo_consumer.config.events_jsonl)
            spool_tasks.append(asyncio.create_task(asapo_consumer.run(spool_stop)))
            logger.info(
                "ASAPO spool consumer started",
                campaign=settings.hzdr_spool.campaign,
                broker_kind=settings.hzdr_spool.broker_kind,
                broker=(
                    settings.hzdr_spool.broker_url
                    if settings.hzdr_spool.broker_kind == "http"
                    else settings.hzdr_spool.asapo_endpoint
                ),
            )
        if settings.hzdr_kafka_spool.enabled:
            from .consumer.kafka import KafkaSpoolConsumer

            kafka_consumer = KafkaSpoolConsumer.from_settings(spool_root)
            spool_consumers.append(kafka_consumer)
            builder_trigger_jsonl.append(kafka_consumer.config.events_jsonl)
            spool_tasks.append(asyncio.create_task(kafka_consumer.run(spool_stop)))
            logger.info(
                "Kafka spool consumer started",
                campaign=settings.hzdr_kafka_spool.campaign,
                bootstrap_servers=settings.hzdr_kafka_spool.bootstrap_servers,
                topics=settings.hzdr_kafka_spool.topics,
            )

        if settings.hzdr_builder.enabled and spool_consumers:
            from .consumer.builder_trigger import BuilderTrigger

            builder_trigger = BuilderTrigger(
                settings.hzdr_builder,
                events_jsonl=builder_events_jsonl,
                trigger_jsonl=builder_trigger_jsonl,
            )
            for consumer in spool_consumers:
                consumer.on_new_events_hook = builder_trigger.notify
            spool_tasks.append(asyncio.create_task(builder_trigger.run(spool_stop)))
            logger.info(
                "Builder auto-trigger started",
                output_nexus=str(settings.hzdr_builder.output_nexus),
                debounce_seconds=settings.hzdr_builder.debounce_seconds,
            )
        elif settings.hzdr_builder.enabled:
            logger.warning(
                "DW_API_HZDR_BUILDER__ENABLED=true but no spool consumer is "
                "enabled; nothing will trigger the builder"
            )

        yield

        if spool_tasks:
            spool_stop.set()
            for task in spool_tasks:
                task.cancel()
            for task in spool_tasks:
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
        for consumer in spool_consumers:
            await consumer.aclose()

    swagger_oauth = (
        None
        if settings.auth is None
        else {
            "usePkceWithAuthorizationCodeGrant": True,
            "clientId": settings.auth.client_id,
        }
    )
    app = FastAPI(lifespan=lifespan, swagger_ui_init_oauth=swagger_oauth)

    @app.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        """Redirect the API root to the interactive documentation."""
        return RedirectResponse(url="/docs")

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):  # noqa: RUF029
        request_path = request.url.path
        if (
            not settings.is_local
            and exc.status_code == status.HTTP_401_UNAUTHORIZED
            and request_path in KNOWN_PATHS
        ):
            return RedirectResponse(url=f"/oauth/login?redirect_uri={request_path}")
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    @app.exception_handler(errors.DWError)
    async def base_exception_handler(request: Request, exc: errors.DWError):  # noqa: RUF029
        status_code = exc.code or status.HTTP_500_INTERNAL_SERVER_ERROR

        content: dict[str, str | int | dict] = {
            "message": exc.message,
            "status_code": status_code,
        }

        if exc.details:
            content["details"] = exc.details

        if exc.request_id:
            content["request_id"] = exc.request_id

        return JSONResponse(
            status_code=status_code,
            content=content,
        )

    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret.get_secret_value(),  # pyright: ignore[reportOptionalMemberAccess]
    )

    app.add_middleware(RequestLoggingMiddleware)

    try:
        from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

        app.add_middleware(
            ProxyHeadersMiddleware, trusted_hosts=["localhost", "127.0.0.1"]
        )
    except Exception:
        logger.warning("Could not add proxy headers middleware")

    return app


if __name__ == "__main__":
    import argparse
    import os

    parser = argparse.ArgumentParser(description="DAMNIT Web API Server")
    parser.add_argument("--path", type=str, help="Path to amore/damnit directory")
    args = parser.parse_args()

    if args.path:
        from pathlib import Path

        path = Path(args.path)
        if not path.is_dir():
            parser.error(f"'{args.path}' does not exist or is not a directory")

        missing = [
            name
            for name in ("runs.sqlite", "context.py", "extracted_data")
            if not (path / name).exists()
        ]
        if missing:
            parser.error(
                f"'{args.path}' is not a valid DAMNIT directory"
                f" (missing: {', '.join(missing)})"
            )

        os.environ["DW_API_DAMNIT_PATH"] = args.path

    import uvicorn

    from . import _logging, get_logger
    from .shared.settings import settings

    _logging.configure(
        level=settings.log_level,
        debug=settings.debug,
        add_call_site_parameters=True,
    )

    logger = get_logger()

    logger.debug("Settings", **settings.model_dump())

    logger.info("Starting uvicorn with settings", **settings.uvicorn.model_dump())

    uvicorn.run(
        "damnit_api.main:create_app",
        **settings.uvicorn.model_dump(),
    )
