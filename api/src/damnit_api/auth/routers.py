from urllib.parse import parse_qs, unquote

from authlib.integrations.starlette_client import (  # type: ignore[import-untyped]
    OAuthError,
)
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from .. import get_logger
from . import dependencies

logger = get_logger(__name__)

router = APIRouter(prefix="/oauth", tags=["auth"])


@router.get("/login")
async def auth(
    request: Request,
    redirect_uri: dependencies.RedirectURI,
    client: dependencies.Client,
):
    """Initiate the OAuth2 login flow."""
    # Note: session is managed by Starlette's SessionMiddleware, which handles
    # expiration.
    if request.session.get("user"):
        return RedirectResponse(url=redirect_uri)

    callback_uri = request.url_for("callback")

    if callback_uri.scheme == "http":
        # TODO: error on non-HTTPS in production
        await logger.awarning("Callback URI is using HTTP, upgrading to HTTPS")
        callback_uri = callback_uri.replace(scheme="https")

    res = await client.authorize_redirect(request, redirect_uri=str(callback_uri))

    await logger.adebug("OAuth redirect response", headers=res.headers)

    return res


@router.get("/callback")
async def callback(
    request: Request,
    redirect_uri: dependencies.RedirectURI,
    client: dependencies.Client,
):
    """OAuth2 callback endpoint to handle the response from the OAuth provider."""
    try:
        token = await client.authorize_access_token(request)
        user = await client.userinfo(token=token)
    except OAuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    state = request.query_params.get("state", "")
    state_params = parse_qs(state)
    redirect_uri = state_params.get("redirect_uri", [redirect_uri])[0]

    request.session["user"] = dict(user)
    return RedirectResponse(url=unquote(str(redirect_uri)))


@router.get("/logout")
async def logout(request: Request, client: dependencies.Client):
    """Redirect to the OAuth provider's logout endpoint and clear the session."""
    logout_endpoint = client.server_metadata.get("end_session_endpoint")

    request.session.clear()

    if logout_endpoint:
        return RedirectResponse(url=logout_endpoint)

    return {"detail": "Logged out"}


@router.get("/userinfo")
async def userinfo(user: dependencies.OAuthUserInfo):
    return user


@router.get("/userinfo/full")
async def full_userinfo(user: dependencies.User):
    return user
