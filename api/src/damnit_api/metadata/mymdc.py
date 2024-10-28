import requests
from dotenv import dotenv_values

from .. import get_logger
from ..settings import settings

logger = get_logger()

ENV_VARS = dotenv_values()


class MyMDC:
    HEADERS = {
        "accept": "application/json; version=1",
        "Content-Type": "application/json",
    }

    token: str

    def __init__(self):
        logger.info("Initializing MyMDC client")
        self.fetch_token()

    def fetch_token(self):
        url = f"{settings.mymdc.base_url}/api/../oauth/token"
        logger.debug("Fetching MyMDC token", url=url)
        body = {
            "grant_type": "client_credentials",
            "client_id": settings.mymdc.client_id,
            "client_secret": settings.mymdc.client_secret.get_secret_value(),
        }

        response = requests.post(url, headers=self.HEADERS, json=body)
        response.raise_for_status()

        data = response.json()

        self.token = data["access_token"]
        return self.token

    def fetch_proposal_info(self, proposal_num):
        url = f"{settings.mymdc.base_url}/api/proposals/by_number/{proposal_num}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()

        return response.json()

    def fetch_user(self, user_id):
        url = f"{settings.mymdc.base_url}/api/users/{user_id}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

    @property
    def headers(self):
        return {**self.HEADERS, "Authorization": f"Bearer {self.token}"}
