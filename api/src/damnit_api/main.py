from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

# Known paths are redirected to the login page and
# then back after successful authentication.
KNOWN_PATHS = ["/graphql"]


def create_app():
    from . import auth, metadata
    from .graphql import add_graphql_router
    from .settings import settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
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


if __name__ == "__main__":
    import uvicorn

    from .settings import settings

    host = settings.address.host or "127.0.0.1"
    port = settings.address.port or 8000

    uvicorn.run(
        "damnit_api.main:create_app",
        host=host,
        port=port,
        reload=True,
        factory=True,
    )
