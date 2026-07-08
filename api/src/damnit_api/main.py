from contextlib import asynccontextmanager

from litestar import Litestar
from litestar.di import Provide
from litestar.exceptions import HTTPException

from . import contextfile, metadata
from ._db.dependencies import get_session
from ._mymdc.dependencies import get_mymdc_client
from .auth.dependencies import get_oauth_user_info, get_user

# Known paths are redirected to the login page after a 401.
KNOWN_PATHS = ["/graphql"]


def create_app():
    import hashlib

    from litestar import Request, Response
    from litestar.middleware.session.client_side import CookieBackendConfig
    from litestar.openapi import OpenAPIConfig
    from litestar.response import Redirect

    from . import _logging, auth, get_logger
    from .auth.oauth import SESSION_COOKIE_KEY, create_oauth_client
    from .graphql.dependencies import get_subscription_cursors
    from .runs.dependencies import get_repositories
    from .shared.errors import DamnitWebError
    from .shared.gql import get_gql_controller
    from .shared.settings import settings
    from .state import (
        AppState,
        create_db_engine,
        create_db_sessionmaker,
        create_mymdc_client,
        create_repositories,
        create_subscription_cursors,
        create_token_store,
        provide_app_state,
    )

    logger = get_logger("lifespan")

    # ── Session middleware ────────────────────────────────────────────────────
    # Derive a 32-byte AES key from the session secret via SHA-256.
    session_secret = settings.session_secret
    assert session_secret is not None  # enforced by Settings validator  # noqa: S101
    session_config = CookieBackendConfig(
        secret=hashlib.sha256(session_secret.get_secret_value().encode()).digest(),
        key=SESSION_COOKIE_KEY,
    )

    # ── Exception handlers ────────────────────────────────────────────────────
    def dw_error_handler(request: Request, exc: DamnitWebError) -> Response:
        code = getattr(exc, "code", None) or 500
        return Response(
            content={
                "message": exc.message,
                "details": exc.details,
                "request_id": exc.request_id,
            },
            status_code=code,
        )

    def unauthorized_handler(
        request: Request, exc: HTTPException
    ) -> Response | Redirect:
        if exc.status_code == 401 and request.url.path in KNOWN_PATHS:
            from urllib.parse import urlencode

            redirect_to = (
                f"/oauth/login?{urlencode({'redirect_uri': request.url.path})}"
            )
            return Redirect(path=redirect_to, status_code=307)
        return Response(content={"detail": exc.detail}, status_code=exc.status_code)

    # ── OpenAPI config ────────────────────────────────────────────────────────
    openapi_config = OpenAPIConfig(title="DAMNIT Web API", version="1.0.0")

    # ── Lifespan ──────────────────────────────────────────────────────────────
    @asynccontextmanager
    async def lifespan(app: Litestar):
        _logging.configure(
            level=settings.log_level,
            debug=settings.debug,
            add_call_site_parameters=True,
        )

        logger.info("Starting application lifespan")

        engine = create_db_engine(settings)

        oauth_client = create_oauth_client(settings)
        if oauth_client is not None:
            await oauth_client.load_server_metadata()

        app.state.app_state = AppState(
            db_engine=engine,
            db_sessionmaker=create_db_sessionmaker(engine),
            mymdc_client=create_mymdc_client(settings),
            oauth_client=oauth_client,
            token_store=create_token_store(),
            repositories=create_repositories(),
            subscription_cursors=create_subscription_cursors(),
        )

        try:
            yield
        finally:
            await engine.dispose()

    # ── Auth controller (mode-dependent, ADR-008 composition) ───────────────
    auth_controller = (
        auth.NoAuthOAuthController if settings.is_local else auth.OAuthController
    )

    # ── GraphQL controller ────────────────────────────────────────────────────
    gql_controller = get_gql_controller()

    return Litestar(
        route_handlers=[
            metadata.router,
            contextfile.router,
            auth_controller,
            gql_controller,
        ],
        lifespan=[lifespan],
        dependencies={
            "app_state": Provide(provide_app_state, sync_to_thread=False),
            # Shared across all routes; resolved on demand.
            "oauth_config": Provide(
                auth.dependencies.get_oauth_client, sync_to_thread=False
            ),
            "token_store": Provide(
                auth.dependencies.get_token_store, sync_to_thread=False
            ),
            "session": Provide(get_session),
            "mymdc": Provide(get_mymdc_client, sync_to_thread=False),
            "user": Provide(get_user),
            "oauth_user": Provide(get_oauth_user_info, sync_to_thread=False),
            "subscription_cursors": Provide(
                get_subscription_cursors, sync_to_thread=False
            ),
            "repositories": Provide(get_repositories, sync_to_thread=False),
        },
        middleware=[
            session_config.middleware,
            _logging.RequestLoggingMiddleware,
        ],
        exception_handlers={  # ty: ignore[invalid-argument-type]
            DamnitWebError: dw_error_handler,
            HTTPException: unauthorized_handler,
        },
        openapi_config=openapi_config,
    )


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
