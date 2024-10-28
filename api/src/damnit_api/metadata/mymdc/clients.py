"""Async MyMdC Client

TODO: I've copy-pasted this code across a few different projects, when/if an async HTTPX
MyMdC client package is created this can be removed and replaced with calls to that."""

import datetime as dt
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any

import httpx
from structlog import get_logger

from ...settings import MyMdCCredentials, Settings

logger = get_logger(__name__)

if TYPE_CHECKING:  # pragma: no cover
    from fastapi import FastAPI


CLIENT: "MyMdCClient" = None  # type: ignore[assignment]


async def _configure(settings: Settings, _: "FastAPI"):
    global CLIENT
    logger.info("Configuring MyMdC client", settings=settings.mymdc)
    auth = MyMdCAuth.model_validate(settings.mymdc, from_attributes=True)
    await auth.acquire_token()
    CLIENT = MyMdCClient(auth=auth)


class MyMdCAuth(httpx.Auth, MyMdCCredentials):
    async def acquire_token(self):
        """Acquires a new token if none is stored or if the existing token expired,
        otherwise reuses the existing token.

        Token data stored under `_access_token` and `_expires_at`.
        """
        expired = self._expires_at <= dt.datetime.now(tz=dt.UTC)
        if self._access_token and not expired:
            logger.debug("Reusing existing MyMdC token", expires_at=self._expires_at)
            return self._access_token

        logger.info(
            "Requesting new MyMdC token",
            access_token_none=not self._access_token,
            expires_at=self._expires_at,
            expired=expired,
        )

        async with httpx.AsyncClient() as client:
            data = {
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret.get_secret_value(),
                # "scope": "public",
            }

            response = await client.post(str(self.token_url), data=data)

        data = response.json()

        if any(k not in data for k in ["access_token", "expires_in"]):
            logger.critical(
                "Response from MyMdC missing required fields, check webservice "
                "`user-id` and `user-secret`.",
                response=response.text,
                status_code=response.status_code,
            )
            msg = "Invalid response from MyMdC"
            raise ValueError(msg)  # TODO: custom exception, frontend feedback

        expires_in = dt.timedelta(seconds=data["expires_in"])
        self._access_token = data["access_token"]
        self._expires_at = dt.datetime.now(tz=dt.UTC) + expires_in

        logger.info("Acquired new MyMdC token", expires_at=self._expires_at)
        return self._access_token

    async def async_auth_flow(
        self, request: httpx.Request
    ) -> AsyncGenerator[httpx.Request, Any]:
        """Fetches bearer token (if required) and adds required authorization headers to
        the request.

        Yields:
            AsyncGenerator[httpx.Request, Any]: yields `request` with additional headers
        """
        bearer_token = await self.acquire_token()

        request.headers["Authorization"] = f"Bearer {bearer_token}"
        request.headers["accept"] = "application/json; version=1"
        request.headers["X-User-Email"] = self.email

        yield request


class MyMdCClient(httpx.AsyncClient):
    def __init__(self, auth: MyMdCAuth | None = None) -> None:
        """Client for the MyMdC API."""
        if auth is None:
            auth = MyMdCAuth()  # type: ignore[call-arg]

        logger.debug("Creating MyMdC client", auth=auth)

        super().__init__(
            auth=auth,
            base_url="https://in.xfel.eu/metadata/",
        )
