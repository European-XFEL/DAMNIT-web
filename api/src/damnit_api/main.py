from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import ValidationError
from starlette.middleware.sessions import SessionMiddleware

# Known paths are redirected to the login page and
# then back after successful authentication.
KNOWN_PATHS = ["/graphql"]


def create_app():
    from . import auth, logging, metadata
    from .graphql import add_graphql_router
    from .settings import settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logging.configure(
            level=settings.log_level,
            debug=settings.debug,
            add_call_site_parameters=True,
        )

        auth.configure()

        add_graphql_router(app)
        app.router.include_router(auth.router)
        app.router.include_router(metadata.router)
        yield

    app = FastAPI(
        lifespan=lifespan,
        swagger_ui_init_oauth={
            "usePkceWithAuthorizationCodeGrant": True,
            "clientId": settings.auth.client_id,
        },
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
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
        SessionMiddleware, secret_key=settings.session_secret.get_secret_value()
    )

    return app


if __name__ == "__main__":
    import uvicorn

    from . import get_logger, logging
    from .settings import settings

    logging.configure(
        level=settings.log_level,
        debug=settings.debug,
        add_call_site_parameters=True,
    )

    logger = get_logger()

    host = settings.address.host
    port = settings.address.port

    if host == "127.0.0.1":
        logger.critical(
            "Running on localhost, not accessible from outside the local machine"
        )

    from .settings import MTLSSettings, settings

    if settings.mtls is None:
        with suppress(ValidationError):
            settings.mtls = MTLSSettings()  # type: ignore[assignment]

    extra_args = {}
    if settings.mtls:
        extra_args |= {
            "ssl_keyfile": Path(settings.mtls.client_key),
            "ssl_certfile": Path(settings.mtls.client_cert),
            "ssl_ca_certs": str(settings.mtls.root_cert),
            "ssl_cert_reqs": 2,
        }
    else:
        logger.critical("No MTLS settings provided, running without MTLS")
        if host not in {"127.0.0.1", "localhost"}:
            msg = "Refusing to run without MTLS on a public interface."
            logger.critical(msg)
            raise Exception(msg)

    uvicorn.run(
        "damnit_api.main:create_app",
        host=host,
        port=port,
        reload=settings.debug,
        factory=True,
        **extra_args,
    )
