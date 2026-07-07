"""Async MyMdC Clients."""

import datetime as dt
from collections.abc import AsyncGenerator
from typing import Any
from urllib.parse import urlsplit

import httpx
import orjson
import yaml
from anyio import Path as APath
from async_lru import alru_cache
from structlog import get_logger

from damnit_api._mymdc import ports

from . import models
from .settings import MyMdCHTTPSettings, MyMdCMockSettings

logger = get_logger()


class MyMdCAuth(httpx.Auth, MyMdCHTTPSettings):
    """MyMdC Authentication for HTTPX Async Client.

    !!! note

        I've copy-pasted this code across a few different projects, when/if an async
        HTTPX MyMdC client package is created this can be removed and replaced with
        calls to that.
    """

    async def acquire_token(self):
        """Acquires a new token if none is stored or if the existing token expired,
        otherwise reuses the existing token.

        Token data stored under `._access_token` and `._expires_at`.
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


class MyMdCClientAsync(httpx.AsyncClient, ports.MyMdCPort):
    """Client for the MyMdC API."""

    def __init__(self, auth: MyMdCAuth) -> None:
        logger.debug("Creating MyMdC client", auth=auth)

        api_url = str(auth.base_url).rstrip("/") + "/api/"

        super().__init__(auth=auth, base_url=api_url)

    async def _get_proposal_by_number(self, no: models.ProposalNumber):
        response = await self.get(f"proposals/by_number/{no:d}")
        response.raise_for_status()
        return response.json()

    async def _get_user_by_id(self, id: models.UserId):
        response = await self.get(f"users/{id}")
        response.raise_for_status()
        return response.json()

    async def _get_cycle_by_id(self, id: int):
        response = await self.get(f"instrument_cycles/{id}")
        response.raise_for_status()
        return response.json()

    async def _get_user_proposals(self, id: models.UserId):
        response = await self.get(f"users/{id}/proposals")
        response.raise_for_status()
        return response.json()


class MyMdCMockMissError(LookupError):
    """The cassette has no recording for the requested path."""


class MyMdCClientMock(MyMdCMockSettings, ports.MyMdCPort):
    """Mock MyMdC provider for testing and local development.

    Replays responses from the recorded, scrubbed cassette
    (`tests/mock/mymdc/mymdc.yaml`). The cassette is indexed by request path relative to
    `api/`, built with the same path strings as `MyMdCClientAsync` uses, so the
    mock and the real client cannot drift on URL shape.
    """

    # Port methods should be cached, which requires the class to be
    # hashable. Pydantic models are unhashable by default, which
    # means `self` cannot be hashed, breaking the cache decorators.
    # Since a single client is used for the application, the hash value
    # doesn't really matter, so this can just be set to id-derived hash
    __hash__ = object.__hash__

    @staticmethod
    @alru_cache(ttl=5)
    async def _index(file_path: str) -> dict[tuple[str, str], str]:
        cassette = yaml.safe_load(await APath(file_path).read_bytes())
        return {
            (
                interaction["request"]["method"],
                urlsplit(interaction["request"]["uri"]).path.split("/api/", 1)[-1],
            ): interaction["response"]["body"]["string"]
            for interaction in cassette["interactions"]
            if interaction["response"]["status"]["code"] == 200
        }

    async def _replay(self, path: str) -> dict:
        if self.cassette_file is None:
            msg = "MyMdC mock has no cassette file configured"
            raise MyMdCMockMissError(msg)

        index = await self._index(str(self.cassette_file))
        try:
            body = index["GET", path]
        except KeyError:
            msg = (
                f"MyMdC mock has no recording for GET {path}. Add the entity "
                "to tests/mock/mymdc/identity_map.py and re-record: "
                "uv run --group test python tests/mock/mymdc/record.py"
            )
            raise MyMdCMockMissError(msg) from None
        return orjson.loads(body)

    async def _get_proposal_by_number(self, no: models.ProposalNumber):
        return await self._replay(f"proposals/by_number/{no:d}")

    async def _get_user_by_id(self, id: models.UserId):
        return await self._replay(f"users/{id}")

    async def _get_cycle_by_id(self, id: int):
        return await self._replay(f"instrument_cycles/{id}")

    async def _get_user_proposals(self, id: models.UserId):
        return await self._replay(f"users/{id}/proposals")


type MyMdCClient = MyMdCClientAsync | MyMdCClientMock
