import requests

from dotenv import dotenv_values

ENV_VARS = dotenv_values()


class MyMDC:

    HEADERS = {
        "accept": "application/json; version=1",
        "Content-Type": "application/json",
    }

    # TODO: Supply default env values
    SERVER_URL = ENV_VARS.get("MYMDC_SERVER_URL", "")
    CLIENT_ID = ENV_VARS.get("MYMDC_CLIENT_ID", "")
    CLIENT_SECRET = ENV_VARS.get("MYMDC_CLIENT_SECRET", "")

    token: str

    def __init__(self):
        self.fetch_token()

    def fetch_token(self):
        url = f"{self.SERVER_URL}/api/../oauth/token"
        body = {
            "grant_type": "client_credentials",
            "client_id": self.CLIENT_ID,
            "client_secret": self.CLIENT_SECRET,
        }

        response = requests.post(url, headers=self.HEADERS, json=body)
        response.raise_for_status()

        data = response.json()

        self.token = data["access_token"]
        return self.token

    def fetch_proposal_info(self, proposal_num):
        url = f"{self.SERVER_URL}/api/proposals/by_number/{proposal_num}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()

        return response.json()

    def fetch_user(self, user_id):
        url = f"{self.SERVER_URL}/api/users/{user_id}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

    @property
    def headers(self):
        return {**self.HEADERS, "Authorization": f"Bearer {self.token}"}
