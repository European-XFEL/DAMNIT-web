from urllib.parse import parse_qs, unquote, urlencode

from authlib.integrations.starlette_client import OAuthError
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from .. import get_logger
from .._db.dependencies import DBSession
from .._mymdc.dependencies import MyMdCClient
from . import dependencies, models

logger = get_logger()

router = APIRouter(prefix="/oauth", tags=["auth"])

TOKEN_STORE = {}


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

    if x_forwarded_host := request.headers.get("x-forwarded-host"):
        callback_uri = callback_uri.replace(netloc=x_forwarded_host)

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

    # TODO: could (should?) be stored in db for persistence across server restarts
    # NOTE: required for revoking tokens on logout
    TOKEN_STORE[user["sub"]] = token

    return RedirectResponse(url=unquote(str(redirect_uri)))


@router.post("/logout")
async def logout(
    request: Request,
    client: dependencies.Client,
) -> JSONResponse:
    """Fully logout the user and revoke tokens.

    Endpoint (attempts to) revoke both access and refresh tokens via revocation
    endpoint, then redirects to end session endpoint if available.
    """
    user_sub = request.session.get("user", {}).get("sub")

    revocation_endpoint = client.server_metadata.get("revocation_endpoint", None)

    if client.client_id and client.client_secret:
        auth = (client.client_id, client.client_secret)
        token = await client.fetch_access_token()

        for k in ("refresh_token", "access_token"):
            if user_token := TOKEN_STORE.get(user_sub, {}).pop(k, None):
                await client.post(
                    revocation_endpoint,
                    token=token,
                    auth=auth,
                    data={"token": user_token, "token_type_hint": f"{k}"},
                )

    end_session_endpoint = client.server_metadata.get("end_session_endpoint")

    token_id = TOKEN_STORE.get(user_sub, {}).pop("id_token", None)

    logout_url = None
    if token_id and end_session_endpoint:
        params = {}
        if token_id:
            params["id_token_hint"] = token_id
        # TODO: request post_logout_redirect_uri added to keycloak client
        # if logout_redirect := request.headers.get("x-forwarded-host"):
        #     params["post_logout_redirect_uri"] = logout_redirect
        logout_url = f"{end_session_endpoint}?{urlencode(params)}"

    try:
        request.session.pop("user", None)
    except Exception:
        await logger.adebug("Failed clearing user session during logout")

    response = JSONResponse(status_code=200, content={"logout_url": logout_url})
    response.delete_cookie("session", path="/")
    return response


@router.get("/userinfo")
async def userinfo(
    request: Request,
    mymdc: MyMdCClient,
    session: DBSession,
    with_proposals: bool = True,
) -> models.User | models.OAuthUserInfo:
    """User information."""
    if with_proposals:
        user = await models.User.from_connection(request, mymdc, session)
    else:
        user = models.OAuthUserInfo.from_connection(request)

    return user
