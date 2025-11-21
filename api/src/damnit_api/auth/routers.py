from urllib.parse import parse_qs, unquote

from authlib.integrations.starlette_client import OAuthError
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from .. import get_logger
from .._mymdc.dependencies import MyMdCClient
from . import dependencies, models

logger = get_logger(__name__)

router = APIRouter(prefix="/oauth", tags=["auth"])


def get_public_base_url(request: Request) -> str:
    # TODO: Upgrade Starlette and use ProxyHeadersMiddleware
    # The forwarded protocol could return "https,http"
    proto = request.headers.get("x-forwarded-proto", "").split(",")
    if not proto or request.url.scheme in proto:
        scheme = request.url.scheme
    else:
        scheme = proto[0]

    host = request.headers.get("x-forwarded-host") or request.headers.get("host")

    return f"{scheme}://{host}"


@router.get("/login", status_code=307)
async def auth(
    request: Request,
    redirect_uri: dependencies.RedirectURI,
    client: dependencies.Client,
) -> RedirectResponse:
    """Initiate the OAuth2 login flow."""
    # Note: session is managed by Starlette's SessionMiddleware, which handles
    # expiration.
    if request.session.get("user"):
        return RedirectResponse(url=redirect_uri)

    callback_uri = request.url_for("callback")

    # TODO: error on non-HTTPS in production?

    res = await client.authorize_redirect(request, redirect_uri=str(callback_uri))

    await logger.adebug("OAuth redirect response", headers=res.headers)

    return res


@router.get("/callback", status_code=307)
async def callback(
    request: Request,
    redirect_uri: dependencies.RedirectURI,
    client: dependencies.Client,
) -> RedirectResponse:
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


@router.get("/logout", status_code=307)
async def logout(request: Request, client: dependencies.Client) -> RedirectResponse:
    """Redirect to the OAuth provider's logout endpoint and clear the session."""
    logout_endpoint = client.server_metadata.get("end_session_endpoint")

    request.session.clear()

    if logout_endpoint:
        return RedirectResponse(url=logout_endpoint)

    return RedirectResponse(url="/")


@router.get("/userinfo")
async def userinfo(
    request: Request, mymdc: MyMdCClient, with_proposals: bool = False
) -> models.User | models.OAuthUserInfo:
    """User information."""
    if with_proposals:
        user = await models.User.from_request(request, mymdc)
    else:
        user = models.OAuthUserInfo.from_request(request)

    return user
