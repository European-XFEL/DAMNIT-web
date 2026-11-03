"""Record the MyMdC cassette (`tests/mock/mymdc/mymdc.yaml`).

The cassette is the source of saved MyMdC data. The mock client replays it at runtime
and in tests. To refresh it after a MyMdC API change:

1. Put `DW_API_MYMDC__*` credentials in the repo-root `.env` (never committed).
2. Run, from `api/`:

       set -a; source ../.env; set +a
       uv run --group test python tests/mock/mymdc/record.py

3. Review the cassette diff, checking that no real identities or secrets remain
  (the scrub hooks below strip them, but verify before committing), then commit.

Scrubbing:

- rewrites the host
- drops the OAuth token exchange
- maps real usernames to fake ones (request paths and bodies)
- replaces personal fields on user records
- truncates user proposal lists to the recorded proposals
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import vcr
from identity_map import (
    RECORDED_CYCLES,
    RECORDED_PROPOSALS,
    RECORDED_USERNAMES,
    RECORDED_USERS,
    USERNAMES,
    fake_user_fields,
)

CASSETTE = Path(__file__).parent / "mymdc.yaml"
FAKE_HOST = "mymdc.example"

# Keys blanked everywhere: secrets, directory internals the app never reads, and
# proposal text that is not otherwise published (abstracts, data plans)
REDACT_KEYS = {
    "logbook_api_key",
    "ldap_description",
    "ldap_destination_indicator",
    "ldap_ou",
    "abstract",
    "data_plan_comments",
    "logbook_url",
    "logbook_identifier",
}


# GPFS paths are rewritten to the committed fixture tree, which mirrors the
# real /gpfs layout (relative to `api/`, where the test suite runs). Proposals
# with data on disk then resolve; the rest cleanly fail the probe
PATH_PREFIXES = {
    "/gpfs/": "tests/mock/data/gpfs/",
}


def _map_username(value: str) -> str:
    for real, fake in USERNAMES.items():
        value = value.replace(real, fake)
    return value


def _map_paths(value: str) -> str:
    for real, fake in PATH_PREFIXES.items():
        value = value.replace(real, fake)
    return value


def _scrub_value(key: str, value):
    if key in REDACT_KEYS:
        return None
    if isinstance(value, str):
        return _map_paths(_map_username(value))
    return value


def _scrub_body(data):
    """Recursively scrub parsed JSON, preserving structure."""
    if isinstance(data, dict):
        # A user record gets that user's fake personal fields; `uid` + `email`
        # + `id` together only occur on user records
        if {"id", "uid", "email"} <= set(data):
            data = {**data, **fake_user_fields(data["id"])}
        return {
            key: _scrub_body(_scrub_value(key, value)) for key, value in data.items()
        }
    if isinstance(data, list):
        # A user proposal list ({proposal_id, proposal_number} items) is truncated
        # to the recorded proposals; everything else is scrubbed item by item
        if data and all(
            isinstance(item, dict) and set(item) == {"proposal_id", "proposal_number"}
            for item in data
        ):
            return [
                item for item in data if item["proposal_number"] in RECORDED_PROPOSALS
            ]
        # A proposal `users_ids` triple ([id, username, provider]) carries real
        # LDAP usernames: replace with the identity map or a deterministic fake
        if (
            len(data) == 3
            and isinstance(data[0], int)
            and isinstance(data[1], str)
            and isinstance(data[2], str)
        ):
            user_id, username, provider = data
            fake = USERNAMES.get(username, f"user-{user_id}")
            return [user_id, fake, provider]
        return [_scrub_body(item) for item in data]
    if isinstance(data, str):
        return _map_username(data)
    return data


def scrub_request(request):
    if urlsplit(request.uri).path.endswith("/oauth/token"):
        return None  # never record the token exchange

    scheme, _, path, query, fragment = urlsplit(request.uri)
    path = "/".join(_map_username(segment) for segment in path.split("/"))
    request.uri = urlunsplit((scheme, FAKE_HOST, path, query, fragment))
    request.headers = {}
    return request


def scrub_response(response):
    body = response["body"]["string"]
    if body:
        scrubbed = _scrub_body(json.loads(body))
        response["body"]["string"] = json.dumps(scrubbed).encode("utf-8")
    response["headers"] = {}
    return response


async def record():
    from damnit_api._mymdc.clients import MyMdCAuth, MyMdCClientAsync

    auth = MyMdCAuth(
        client_id=os.environ["DW_API_MYMDC__CLIENT_ID"],
        client_secret=os.environ["DW_API_MYMDC__CLIENT_SECRET"],
        email=os.environ["DW_API_MYMDC__EMAIL"],
        token_url=os.environ["DW_API_MYMDC__TOKEN_URL"],
        base_url=os.environ["DW_API_MYMDC__BASE_URL"],
    )
    client = MyMdCClientAsync(auth)

    # The raw `_get_*` methods skip the ports-layer cache and model validation:
    # the cassette should hold exactly what the API returned (post-scrub)
    for number in RECORDED_PROPOSALS:
        await client._get_proposal_by_number(number)
    for user_id in RECORDED_USERS:
        await client._get_user_by_id(user_id)
    for username in RECORDED_USERNAMES:
        await client._get_user_proposals(username)
    for cycle_id in RECORDED_CYCLES:
        await client._get_cycle_by_id(cycle_id)


def main():
    missing = [
        key
        for key in ("CLIENT_ID", "CLIENT_SECRET", "EMAIL", "TOKEN_URL", "BASE_URL")
        if not os.environ.get(f"DW_API_MYMDC__{key}")
    ]
    if missing:
        sys.exit(f"Missing MyMdC credentials in environment: {missing}")

    CASSETTE.unlink(missing_ok=True)

    recorder = vcr.VCR(
        record_mode="all",
        decode_compressed_response=True,
        filter_headers=["authorization", "x-user-email", "cookie", "set-cookie"],
        before_record_request=scrub_request,
        before_record_response=scrub_response,
    )
    with recorder.use_cassette(str(CASSETTE)):
        asyncio.run(record())

    print(f"Recorded {CASSETTE}")


if __name__ == "__main__":
    main()
