from authlib.integrations.starlette_client import (  # type: ignore[import-untyped]
    OAuth,
    OAuthError,
    StarletteOAuth2App,
)
from authlib.jose import jwt, JoseError
from dotenv import dotenv_values
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from .settings import settings

router = APIRouter(prefix="/oauth", include_in_schema=False)

_OAUTH = OAuth()

OAUTH: StarletteOAuth2App = None  # type: ignore[assignment]

env = dotenv_values(".env")


def configure() -> None:
    global OAUTH

    _OAUTH.register(
        name="dadev",
        client_id=settings.auth.client_id,
        client_secret=settings.auth.client_secret.get_secret_value(),
        server_metadata_url=str(settings.auth.server_metadata_url),
    )

    OAUTH = _OAUTH.dadev  # type: ignore[assignment, no-redef]


@router.get("/")
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

    response = RedirectResponse(url="/home")
    response.set_cookie(key="DAMNIT_AUTH_USER", value=to_jwt(user))

    return response


@router.get("/logout")
async def logout(request: Request):
    response = RedirectResponse(url=request.base_url)
    response.delete_cookie(key="DAMNIT_AUTH_USER")
    return response


async def check_auth(request: Request):
    user_token = request.cookies.get("DAMNIT_AUTH_USER")
    if not user_token:
        raise HTTPException(
            status_code=401,
            detail=(
                "Unauthorized - no authentication provided"
                if request.url.path.rstrip("/") != request.scope.get("root_path", "")
                else ""
            ),
        )

    user = from_jwt(user_token)
    if "da" not in user.get("groups", []):
        raise HTTPException(
            status_code=403,
            detail=f"Forbidden - `{user.get('preferred_username')}` not allowed access",
        )


def to_jwt(data: dict):
    encoded = jwt.encode({"alg": env.get("DAMNIT_JWT_ALGORITHM"),
                         "typ": "JWT"}, data, env.get("DAMNIT_JWT_SECRET"))
    return encoded.decode('utf-8')


def from_jwt(token: str):
    try:
        data = jwt.decode(token, env.get("DAMNIT_JWT_SECRET"), claims_cls=None)
        data.validate()
        return data
    except JoseError as e:
        raise HTTPException(status_code=403, detail="Could not validate credentials") from e
