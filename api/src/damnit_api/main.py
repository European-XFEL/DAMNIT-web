from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

from ._logging import RequestLoggingMiddleware

# Known paths are redirected to the login page and
# then back after successful authentication.
KNOWN_PATHS = ["/graphql"]


def create_app():
    from . import _logging, auth, contextfile, get_logger, metadata
    from .shared import errors, gql
    from .shared.settings import settings
    from .state import (
        AppState,
        create_damnit_registry,
        create_db_engine,
        create_db_sessionmaker,
        create_mymdc_client,
        create_oauth_client,
        create_token_store,
    )

    logger = get_logger("lifespan")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        _logging.configure(
            level=settings.log_level,
            debug=settings.debug,
            add_call_site_parameters=True,
        )

        logger.info("Starting application lifespan")

        oauth_client = create_oauth_client(settings)
        if oauth_client is not None:
            await oauth_client.load_server_metadata()

        db_engine = create_db_engine(settings)
        app.state.app_state = AppState(
            db_engine=db_engine,
            db_sessionmaker=create_db_sessionmaker(db_engine),
            mymdc_client=create_mymdc_client(settings),
            oauth_client=oauth_client,
            token_store=create_token_store(),
            damnit_registry=create_damnit_registry(),
        )

        if settings.is_local:
            app.router.include_router(auth.noauth_router)
        else:
            app.router.include_router(auth.router)
        app.router.include_router(metadata.router)
        app.router.include_router(contextfile.router)
        app.router.include_router(gql.get_gql_app(), prefix="/graphql")
        yield

    swagger_oauth = (
        None
        if settings.auth is None
        else {
            "usePkceWithAuthorizationCodeGrant": True,
            "clientId": settings.auth.client_id,
        }
    )
    app = FastAPI(lifespan=lifespan, swagger_ui_init_oauth=swagger_oauth)

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

    @app.exception_handler(errors.DamnitWebError)
    async def base_exception_handler(request: Request, exc: errors.DamnitWebError):  # noqa: RUF029
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
