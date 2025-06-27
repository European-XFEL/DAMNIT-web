from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

# Known paths are redirected to the login page and
# then back after successful authentication.
KNOWN_PATHS = ["/graphql"]


def create_app():
    from . import _logging, auth, contextfile, metadata
    from .graphql import add_graphql_router
    from .settings import settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # noqa: RUF029
        _logging.configure(
            level=settings.log_level,
            debug=settings.debug,
            add_call_site_parameters=True,
        )

        auth.configure()

        add_graphql_router(app)
        app.router.include_router(auth.router)
        app.router.include_router(metadata.router)
        app.router.include_router(contextfile.router)
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
            return RedirectResponse(
                url=f"/oauth/login?redirect_uri={request_path}"
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret.get_secret_value(),
    )

    return app


if __name__ == "__main__":
    import uvicorn

    from . import _logging, get_logger
    from .settings import settings

    _logging.configure(
        level=settings.log_level,
        debug=settings.debug,
        add_call_site_parameters=True,
    )

    logger = get_logger()

    # TODO: warning/logging for address bind to localhost only which is aware
    # of running in container/in front of reverse proxy?

    logger.info(
        "Starting uvicorn with settings", **settings.uvicorn.model_dump()
    )

    if settings.uvicorn.ssl_cert_reqs != 2:
        logger.warning(
            "Not configured to require mTLS. "
            "This is not recommended for production."
        )

    uvicorn.run(
        "damnit_api.main:create_app",
        **settings.uvicorn.model_dump(),
    )
