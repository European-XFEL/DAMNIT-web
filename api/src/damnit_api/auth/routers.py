from authlib.integrations.starlette_client import (  # type: ignore[import-untyped]
    OAuth,
    OAuthError,
    StarletteOAuth2App,
)
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from typing_extensions import Annotated

from ..settings import settings
from . import services
from .models import User


router = APIRouter(prefix="/oauth", include_in_schema=False)

_OAUTH = OAuth()

OAUTH: StarletteOAuth2App = None  # type: ignore[assignment]

DEFAULT_LOGIN_REDIRECT_URI = "/home"
DEFAULT_LOGOUT_REDIRECT_URI = "/logged-out"


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
async def auth(
    request: Request, redirect_uri: str = DEFAULT_LOGIN_REDIRECT_URI
):
    if request.session.get("user"):
        return RedirectResponse(url=redirect_uri)

    callback_uri = request.url_for("callback").include_query_params(
        redirect_uri=redirect_uri
    )
    return await OAUTH.authorize_redirect(request, callback_uri)


@router.get("/callback")
async def callback(
    request: Request, redirect_uri: str = DEFAULT_LOGIN_REDIRECT_URI
):
    try:
        token = await OAUTH.authorize_access_token(request)
        user = await OAUTH.userinfo(token=token)
    except OAuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    request.session["user"] = dict(user)
    return RedirectResponse(url=redirect_uri)


@router.get("/logout")
async def logout(
    request: Request, redirect_uri: str = DEFAULT_LOGIN_REDIRECT_URI
):
    request.session.pop("user", None)
    return RedirectResponse(url=redirect_uri)


@router.get("/userinfo")
async def userinfo(user: Annotated[User, Depends(services.user_from_session)]):
    return user.model_dump(exclude={"groups"})
