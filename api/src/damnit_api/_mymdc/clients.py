"""Async MyMdC Clients."""

import datetime as dt
from collections.abc import AsyncGenerator
from typing import Any

import httpx
from structlog import get_logger

from damnit_api._mymdc import ports

from . import models
from .settings import MockMyMdCData, MyMdCCredentials

logger = get_logger(__name__)


class MyMdCAuth(httpx.Auth, MyMdCCredentials):
    """MyMdC Authentication for HTTPX Async Client.

    !!! note

        I've copy-pasted this code across a few different projects, when/if an async
        HTTPX MyMdC client package is created this can be removed and replaced with
        calls to that.
    """

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
            }

            if self.scope:
                data["scope"] = self.scope

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


class MyMdCClient(httpx.AsyncClient, ports.MyMdCPort):
    """Client for the MyMdC API."""

    def __init__(self, auth: MyMdCAuth) -> None:
        logger.debug("Creating MyMdC client", auth=auth)

        super().__init__(
            auth=auth,
            base_url=str(auth.base_url),
        )

    async def _get_proposal_by_number(self, no: models.ProposalNo):
        response = await self.get(f"proposals/by_number/{no}")
        response.raise_for_status()
        return response.json()

    async def _get_user_by_id(self, id: models.UserId):
        response = await self.get(f"users/{id}")
        response.raise_for_status()
        return response.json()


class MockMyMdCClient(MockMyMdCData, ports.MyMdCPort):
    """Mock MyMdC provider for testing and local development."""

    async def _get_user_by_id(self, id: models.UserId):
        """Mock method to get user information."""
        return self.mock_users[int(id)].model_dump()

    async def _get_proposal_by_number(self, no: models.ProposalNo):
        """Mock method to get proposals by number."""
        return self.mock_proposals[int(no.root)].model_dump()
