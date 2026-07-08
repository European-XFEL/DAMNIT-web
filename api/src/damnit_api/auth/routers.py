"""OAuth2 authentication route handlers (Litestar)."""

from typing import Annotated, ClassVar
from urllib.parse import urlencode, urlparse, urlunparse

from authlib.integrations.httpx_client import AsyncOAuth2Client
from litestar import Controller, Request, get, post
from litestar.background_tasks import BackgroundTask
from litestar.datastructures import Cookie
from litestar.di import Provide
from litestar.exceptions import HTTPException
from litestar.params import Dependency
from litestar.response import Redirect, Response

from .. import get_logger
from .._db.dependencies import DBSession
from .._mymdc.dependencies import MyMdCClient
from ..runs.dependencies import Repositories
from ..state import SESSION_COOKIE_KEY, OAuthClient
from . import dependencies, models
from .token_store import TokenStore

logger = get_logger()

DEFAULT_LOGIN_REDIRECT = "/app/home"


def _build_callback_uri(request: Request) -> str:
    """Return the /oauth/callback URL, honouring x-forwarded-host if trusted."""
    uri = str(request.url_for("callback"))

    from ..shared.settings import settings

    if settings.trust_forwarded_host and (
        x_forwarded_host := request.headers.get("x-forwarded-host")
    ):
        parsed = urlparse(uri)
        uri = urlunparse(parsed._replace(netloc=x_forwarded_host))
    return uri


def _sanitize_redirect_target(target: str | None) -> str:
    """Allow-list post-login redirects: relative, same-origin paths only."""
    if not target:
        return DEFAULT_LOGIN_REDIRECT
    parsed = urlparse(target)
    if (
        parsed.scheme
        or parsed.netloc
        or not target.startswith("/")
        or target.startswith("//")
    ):
        return DEFAULT_LOGIN_REDIRECT
    return target


async def _revoke_tokens(
    oauth_config: OAuthClient,
    revocation_endpoint: str,
    tokens: list[tuple[str, str]],
) -> None:
    """Best-effort token revocation; failures are logged and swallowed."""
    from authlib.integrations import httpx_client

    client = httpx_client.AsyncOAuth2Client(
        client_id=oauth_config.client_id,
        client_secret=oauth_config.client_secret,
    )
    try:
        for token_type_hint, token in tokens:
            try:
                await client.post(  # type: ignore[attr-defined]
                    revocation_endpoint,
                    data={"token": token, "token_type_hint": token_type_hint},
                )
            except Exception:
                await logger.adebug(
                    "Token revocation failed", token_type=token_type_hint
                )
    finally:
        await client.aclose()  # type: ignore[attr-defined]


class OAuthController(Controller):
    """OAuth2 login/callback/logout/userinfo endpoints."""

    path = "/oauth"
    tags: ClassVar[list[str]] = ["auth"]  # ty: ignore[invalid-attribute-override]
    dependencies: ClassVar[dict[str, Provide]] = {  # ty: ignore[invalid-attribute-override]
        "oauth_http_client": Provide(dependencies.get_oauth_http_client),
    }

    @get("/login", status_code=302)
    async def auth(
        self,
        request: Request,
        oauth_config: OAuthClient,
        oauth_http_client: Annotated[
            AsyncOAuth2Client, Dependency(skip_validation=True)
        ],
        redirect_uri: str | None = None,
    ) -> Redirect:
        """Initiate the OAuth2 login flow."""
        target = _sanitize_redirect_target(redirect_uri)
        if request.session.get("user"):
            return Redirect(path=target)

        callback_uri = _build_callback_uri(request)

        url, state = oauth_http_client.create_authorization_url(
            oauth_config.server_metadata["authorization_endpoint"],
            redirect_uri=callback_uri,
        )

        request.session["_oauth_state"] = state
        request.session["_login_redirect"] = target
        await logger.adebug("OAuth redirect", url=url)
        return Redirect(path=url)

    @get("/callback", name="callback", status_code=302)
    async def callback(
        self,
        request: Request,
        oauth_config: OAuthClient,
        token_store: TokenStore,
        oauth_http_client: Annotated[
            AsyncOAuth2Client, Dependency(skip_validation=True)
        ],
    ) -> Redirect:
        """OAuth2 callback: exchange code for token and set session."""
        saved_state = request.session.pop("_oauth_state", None)
        received_state = request.query_params.get("state")

        if saved_state is None or saved_state != received_state:
            msg = "OAuth state mismatch — possible CSRF attempt"
            raise HTTPException(status_code=401, detail=msg)

        callback_uri = _build_callback_uri(request)

        try:
            token = await oauth_http_client.fetch_token(
                oauth_config.server_metadata["token_endpoint"],
                authorization_response=str(request.url),
                redirect_uri=callback_uri,
            )
            userinfo_resp = await oauth_http_client.get(
                oauth_config.server_metadata["userinfo_endpoint"],
                token=token,  # ty: ignore[unknown-argument]
            )
            userinfo_resp.raise_for_status()
            user = userinfo_resp.json()
        except HTTPException:
            raise
        except Exception as e:
            msg = str(e)
            raise HTTPException(status_code=401, detail=msg) from e

        # Symmetric with /login: the post-login destination travels in the
        # session and is re-validated against the relative-path allow-list.
        target = _sanitize_redirect_target(request.session.pop("_login_redirect", None))

        request.session["user"] = user
        token_store.store(str(user["sub"]), token)

        return Redirect(path=target)

    @post("/logout")
    async def logout(
        self,
        request: Request,
        oauth_config: OAuthClient,
        token_store: TokenStore,
    ) -> Response:
        """Clear the session; revoke tokens in the background."""
        user_sub = request.session.get("user", {}).get("sub")
        revocation_endpoint = oauth_config.server_metadata.get("revocation_endpoint")
        end_session_endpoint = oauth_config.server_metadata.get(
            "end_session_endpoint"
        )

        tokens_to_revoke: list[tuple[str, str]] = []
        if (
            revocation_endpoint
            and oauth_config.client_id
            and oauth_config.client_secret
        ):
            tokens_to_revoke = [
                (k, token)
                for k in ("refresh_token", "access_token")
                if (token := token_store.pop_token_field(user_sub, k))
            ]

        token_id = token_store.pop_token_field(user_sub, "id_token")
        logout_url = None
        if token_id and end_session_endpoint:
            params = {"id_token_hint": token_id}
            logout_url = f"{end_session_endpoint}?{urlencode(params)}"

        try:
            request.session.pop("user", None)
        except Exception:
            await logger.adebug("Failed clearing user session during logout")

        background = None
        if tokens_to_revoke and revocation_endpoint:
            background = BackgroundTask(
                _revoke_tokens, oauth_config, revocation_endpoint, tokens_to_revoke
            )

        return Response(
            content={"logout_url": logout_url},
            cookies=[Cookie(key=SESSION_COOKIE_KEY, value="", max_age=0, path="/")],
            background=background,
        )

    @get("/userinfo")
    async def userinfo(
        self,
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


class NoAuthOAuthController(Controller):
    """Local-mode (auth-disabled) equivalents of the OAuth endpoints."""

    path = "/oauth"
    tags: ClassVar[list[str]] = ["auth"]  # ty: ignore[invalid-attribute-override]

    @get("/userinfo")
    async def userinfo(self, repositories: Repositories) -> dict:
        """User info for local (auth-disabled) mode."""
        from ..metadata.services import LOCAL_CYCLE, _local_proposal_number

        proposals = {}
        proposal_number = await _local_proposal_number(repositories)
        if proposal_number:
            proposals = {LOCAL_CYCLE: [proposal_number]}

        return {**models.DEV_USER.model_dump(), "proposals_by_year_half": proposals}

    @post("/logout", sync_to_thread=False)
    def logout(self, request: Request) -> Response:
        """Logout for local (auth-disabled) mode."""
        request.session.pop("user", None)
        return Response(
            content={"logout_url": None},
            cookies=[Cookie(key=SESSION_COOKIE_KEY, value="", max_age=0, path="/")],
        )
