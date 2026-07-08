from contextlib import asynccontextmanager

from litestar import Litestar, Router
from litestar.di import Provide
from litestar.exceptions import HTTPException

from . import contextfile, metadata
from ._mymdc.dependencies import get_mymdc_client
from .auth.dependencies import get_oauth_user_info, get_user
from .auth.policy import proposal_member_guard

# Known paths are redirected to the login page after a 401.
KNOWN_PATHS = ["/graphql"]


def create_app():
    from advanced_alchemy.extensions.litestar import (
        AsyncSessionConfig,
        SQLAlchemyAsyncConfig,
        SQLAlchemyPlugin,
    )
    from litestar import Request, Response
    from litestar.channels import ChannelsPlugin
    from litestar.channels.backends.memory import MemoryChannelsBackend
    from litestar.middleware.session.server_side import ServerSideSessionConfig
    from litestar.openapi import OpenAPIConfig
    from litestar.response import Redirect
    from litestar.stores.file import FileStore
    from litestar.stores.memory import MemoryStore
    from litestar.stores.registry import StoreRegistry
    from sqlmodel import SQLModel

    from . import _logging, auth, get_logger
    from .auth.oauth import SESSION_COOKIE_KEY, create_oauth_client
    from .graphql.dependencies import get_channels, get_run_update_publisher
    from .graphql.publisher import SqlitePollingRunUpdatePublisher
    from .runs.dependencies import get_repositories
    from .shared.errors import DamnitWebError
    from .shared.gql import get_gql_controller
    from .shared.settings import settings
    from .state import (
        AppState,
        create_mymdc_client,
        create_repositories,
        provide_app_state,
    )

    logger = get_logger("lifespan")

    # ── Stores + server-side sessions ─────────────────────────────────────────
    # Sessions are server-side: the cookie carries only an opaque session id;
    # session data lives in a Litestar store. The same registry backs every
    # named store (sessions, response cache); the backend is mode-dependent
    # (in-memory locally, file-backed otherwise) and selected below.
    session_config = ServerSideSessionConfig(key=SESSION_COOKIE_KEY)

    # ── App database (ADR-010: `appdb`, dw_api.sqlite) ───────────────────────
    # Advanced Alchemy owns engine/session lifecycle and provides the
    # per-request `session` dependency (commit-on-success). Distinct
    # dependency/state keys so a second config (e.g. a future DAMNIT
    # Postgres) can coexist.
    alchemy_config = SQLAlchemyAsyncConfig(
        connection_string=f"sqlite+aiosqlite:///{settings.db_path}",
        session_config=AsyncSessionConfig(expire_on_commit=False),
        session_dependency_key="session",
        engine_dependency_key="appdb_engine",
        metadata=SQLModel.metadata,
        create_all=True,
    )

    # ── Channels (run-update pub/sub) ─────────────────────────────────────────
    # Subscribers consume per-proposal channels; the composition-selected
    # publisher (built in the lifespan) produces the events. The in-memory
    # backend is process-local (ADR-009).
    channels_plugin = ChannelsPlugin(
        backend=MemoryChannelsBackend(),
        arbitrary_channels_allowed=True,
    )

    # ── Multi-worker guard ────────────────────────────────────────────────────
    # The channels backend (and, in local mode, the session store) are
    # process-local, so run-update events and sessions are not shared across
    # workers. Refuse to start multi-worker until shared backends are wired
    # (ADR-009).
    process_local = ["channels: MemoryChannelsBackend"]
    if settings.is_local:
        process_local.append("stores: MemoryStore")
    workers = getattr(settings.uvicorn, "workers", None) or 1
    if workers > 1:
        msg = (
            f"uvicorn workers={workers} requires shared backends, but these "
            f"are process-local: {', '.join(process_local)}. Run a single "
            "worker, or wire shared channels/store backends (ADR-009)."
        )
        raise RuntimeError(msg)

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

        oauth_client = create_oauth_client(settings)
        if oauth_client is not None:
            await oauth_client.load_server_metadata()

        repositories = create_repositories()
        run_update_publisher = SqlitePollingRunUpdatePublisher(
            channels=channels_plugin,
            repositories=repositories,
        )

        app.state.app_state = AppState(
            db_sessionmaker=alchemy_config.create_session_maker(),
            mymdc_client=create_mymdc_client(settings),
            oauth_client=oauth_client,
            repositories=repositories,
            channels=channels_plugin,
            run_update_publisher=run_update_publisher,
        )

        try:
            yield
        finally:
            await run_update_publisher.aclose()

    def _file_store(name: str) -> FileStore:
        # FileStore does not create its directory on write; the session read
        # path (and forged test writes) need it to exist up front.
        path = settings.store_path / name
        path.mkdir(parents=True, exist_ok=True)
        return FileStore(path)

    # ── Mode-dependent composition: controller and stores ───────────────────
    # In-memory stores are process-local: local mode is single-worker, and the
    # file-backed stores serve the deployed (potentially multi-worker) case.
    if settings.is_local:
        auth_controller = auth.NoAuthOAuthController
        stores = StoreRegistry(default_factory=lambda name: MemoryStore())
    else:
        auth_controller = auth.OAuthController
        stores = StoreRegistry(default_factory=_file_store)

    # Proposal-membership authorization is enforced at the REST edge (ADR-011)
    # by a single guard on the proposal-scoped routers; local mode composes it
    # out (ADR-008), so the slices themselves stay authorization-free.
    proposal_guards = [] if settings.is_local else [proposal_member_guard]

    # ── GraphQL controller ────────────────────────────────────────────────────
    gql_controller = get_gql_controller()

    proposal_router = Router(
        path="",
        route_handlers=[metadata.router, contextfile.router],
        guards=proposal_guards,
    )

    return Litestar(
        route_handlers=[
            proposal_router,
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
            # The `session` dependency comes from the Advanced Alchemy plugin.
            "mymdc": Provide(get_mymdc_client, sync_to_thread=False),
            "user": Provide(get_user),
            "oauth_user": Provide(get_oauth_user_info, sync_to_thread=False),
            "channels": Provide(get_channels, sync_to_thread=False),
            "run_update_publisher": Provide(
                get_run_update_publisher, sync_to_thread=False
            ),
            "repositories": Provide(get_repositories, sync_to_thread=False),
        },
        plugins=[channels_plugin, SQLAlchemyPlugin(config=alchemy_config)],
        stores=stores,
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
