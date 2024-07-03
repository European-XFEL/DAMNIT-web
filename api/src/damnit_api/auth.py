from authlib.integrations.starlette_client import (  # type: ignore[import-untyped]
    OAuth,
    OAuthError,
    StarletteOAuth2App,
)
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from .settings import settings

router = APIRouter(prefix="/oauth", include_in_schema=False)

_OAUTH = OAuth()

OAUTH: StarletteOAuth2App = None  # type: ignore[assignment]


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
async def auth(request: Request):
    if request.session.get("user"):
        return RedirectResponse(url="/home")
    return await OAUTH.authorize_redirect(request, request.url_for("callback"))


@router.get("/callback")
async def callback(request: Request):
    try:
        token = await OAUTH.authorize_access_token(request)
        user = await OAUTH.userinfo(token=token)
    except OAuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    request.session["user"] = dict(user)
    return RedirectResponse(url="/home")


@router.get("/logout")
async def logout(request: Request):
    request.session.pop("user", None)
    return RedirectResponse(url="/logged-out")


@router.get("/session")
async def get_session(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized - no authentication provided")

    return JSONResponse(content={"user": user})


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


