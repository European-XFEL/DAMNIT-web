from asyncio import TaskGroup
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

from ._logging import RequestLoggingMiddleware

# Known paths are redirected to the login page and
# then back after successful authentication.
KNOWN_PATHS = ["/graphql"]


def create_app():
    from . import _logging, _mymdc, auth, contextfile, get_logger, metadata
    from .shared import gql
    from .shared.settings import settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        _logging.configure(
            level=settings.log_level,
            debug=settings.debug,
            add_call_site_parameters=True,
        )

        logger = get_logger("lifespan")
        logger.info("Starting application lifespan")

        bootstraps = [_mymdc.bootstrap, auth.bootstrap]
        async with TaskGroup() as tg:
            for bs in bootstraps:
                tg.create_task(bs(settings))

        app.router.include_router(auth.router)
        app.router.include_router(metadata.router)
        app.router.include_router(contextfile.router)
        app.router.include_router(gql.get_gql_app(), prefix="/graphql")
        yield

    app = FastAPI(
        lifespan=lifespan,
        swagger_ui_init_oauth={
            "usePkceWithAuthorizationCodeGrant": True,
            "clientId": settings.auth.client_id,
        },
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):  # noqa: RUF029
        request_path = request.url.path
        if (
            exc.status_code == status.HTTP_401_UNAUTHORIZED
            and request_path in KNOWN_PATHS
        ):
            return RedirectResponse(url=f"/oauth/login?redirect_uri={request_path}")
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret.get_secret_value(),
    )

    app.add_middleware(RequestLoggingMiddleware)

    if settings.localhost_to_127:
        from .shared.middlewares import RedirectLocalhost127Middleware

        app.add_middleware(RedirectLocalhost127Middleware)

    return app


if __name__ == "__main__":
    import uvicorn

    from . import _logging, get_logger
    from .shared.settings import settings

    _logging.configure(
        level=settings.log_level,
        debug=settings.debug,
        add_call_site_parameters=True,
    )

    logger = get_logger()

    # TODO: warning/logging for address bind to localhost only which is aware
    # of running in container/in front of reverse proxy?

    logger.debug("Settings", **settings.model_dump())

    logger.info("Starting uvicorn with settings", **settings.uvicorn.model_dump())

    if settings.uvicorn.ssl_cert_reqs != 2:
        logger.warning(
            "Not configured to require mTLS. This is not recommended for production."
        )

    uvicorn.run(
        "damnit_api.main:create_app",
        **settings.uvicorn.model_dump(),
    )
