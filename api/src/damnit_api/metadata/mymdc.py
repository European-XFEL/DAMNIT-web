import aiohttp

from .. import get_logger
from ..settings import settings

logger = get_logger()


class MyMDC:
    HEADERS = (
        ("accept", "application/json; version=1"),
        ("Content-Type", "application/json"),
    )

    def __init__(self):
        self.session: aiohttp.ClientSession = None  # pyright: ignore[reportAttributeAccessIssue]
        self.token = None

    async def __aenter__(self):
        timeout = aiohttp.ClientTimeout(total=10)  # seconds
        self.session = aiohttp.ClientSession(timeout=timeout)

        await self.fetch_token()
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        await self.session.close()

    async def fetch_token(self):
        """
        Fetch the OAuth token asynchronously.
        """
        url = f"{settings.mymdc.base_url}/api/../oauth/token"
        logger.debug("Fetching MyMDC token", extra={"url": url})
        body = {
            "grant_type": "client_credentials",
            "client_id": settings.mymdc.client_id,
            "client_secret": settings.mymdc.client_secret.get_secret_value(),
        }

        async with self.session.post(
            url, headers=dict(self.HEADERS), json=body
        ) as response:
            response.raise_for_status()
            data = await response.json()

            self.token = data["access_token"]
            return self.token

    async def fetch_proposal_info(self, proposal_num: str):
        """
        Fetch proposal info given a proposal number.
        """
        url = f"{settings.mymdc.base_url}/api/proposals/by_number/{proposal_num}"
        async with self.session.get(url, headers=self.headers) as response:
            response.raise_for_status()
            return await response.json()

    async def fetch_user(self, user_id: str):
        """
        Fetch user info given a user ID.
        """
        url = f"{settings.mymdc.base_url}/api/users/{user_id}"
        async with self.session.get(url, headers=self.headers) as response:
            response.raise_for_status()
            return await response.json()

    @property
    def headers(self):
        return {**dict(self.HEADERS), "Authorization": f"Bearer {self.token}"}
