from authlib.integrations.starlette_client import (  # type: ignore[import-untyped]
    OAuth,
    OAuthError,
    StarletteOAuth2App,
)
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from .settings import settings

router = APIRouter(prefix="/oauth", include_in_schema=False)

_OAUTH = OAuth()

OAUTH: StarletteOAuth2App = None  # type: ignore[assignment]

DEFAULT_REDIRECT_URI = "/home"


def configure() -> None:
    global OAUTH

    _OAUTH.register(
        name="dadev",
        client_id=settings.auth.client_id,
        client_secret=settings.auth.client_secret.get_secret_value(),
        server_metadata_url=str(settings.auth.server_metadata_url),
    )

    OAUTH = _OAUTH.dadev  # type: ignore[assignment, no-redef]


@router.get("/login")
async def auth(request: Request, redirect_uri: str = DEFAULT_REDIRECT_URI):
    if request.session.get("user"):
        return RedirectResponse(url=redirect_uri)

    callback_uri = (request.url_for("callback")
                    .include_query_params(redirect_uri=redirect_uri))
    return await OAUTH.authorize_redirect(request, callback_uri)


@router.get("/callback")
async def callback(request: Request, redirect_uri: str = DEFAULT_REDIRECT_URI):
    try:
        token = await OAUTH.authorize_access_token(request)
        user = await OAUTH.userinfo(token=token)
    except OAuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    request.session["user"] = dict(user)
    return RedirectResponse(url=redirect_uri)


@router.get("/logout")
async def logout(request: Request):
    request.session.pop("user", None)
    return RedirectResponse(url="/logged-out")


async def check_auth(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(
            status_code=401,
            detail=(
                "Unauthorized - no authentication provided"
                if request.url.path.rstrip("/") != request.scope.get("root_path", "")
                else ""
            ),
        )

    if "da" not in user.get("groups", []):
        raise HTTPException(
            status_code=403,
            detail=f"Forbidden - `{user.get('preferred_username')}` not allowed access",
        )

    return user


@router.get("/session")
async def get_session(user: dict = Depends(check_auth)):
    return JSONResponse(content={"user": user})
