"""Real to fake identity mapping for scrubbing recorded MyMdC data.

This is shared by the recorder (`record.py`), the e2e test user
(`tests/refactor/e2e/conftest.py`), and the (future) fixture-dataset generator, so
cassettes, mock responses, and on-disk fixtures always agree.
"""

# Usernames rewritten wherever they appear (request paths and response bodies)
USERNAMES = {
    "roscar": "e2etester",
}

# The MyMdC user id of the account behind the e2etester identity
PRIMARY_USER_ID = 1101

# Replacement values applied to the primary user's record
FAKE_USER = {
    "email": "e2e-tester@example.org",
    "contact_email": "e2e-tester@example.org",
    "first_name": "E2e",
    "last_name": "Tester",
    "name": "E2e Tester",
    "nickname": "e2etester",
    "uid": "e2etester",
}


def fake_user_fields(user_id: int) -> dict:
    """Replacement personal fields for a user record.

    Map `roscar` to `e2etester`, map all others to `user-{id}`, matching the
    scrubbed `users_ids` values on proposals. This is anonymous enough
    for use in a public repo (anybody on internal infra can see which
    `uid`/`gids` have access to which proposals anyway)
    """
    if user_id == PRIMARY_USER_ID:
        return FAKE_USER

    tag = f"user-{user_id}"
    return {
        "email": f"{tag}@example.org",
        "contact_email": f"{tag}@example.org",
        "first_name": "User",
        "last_name": str(user_id),
        "name": f"User {user_id}",
        "nickname": tag,
        "uid": tag,
    }


# Every entity the cassette may contain. User proposal lists are truncated to
# RECORDED_PROPOSALS at scrub time.
# 6996 is the fixture-data proposal (tests/mock/data/gpfs/, see e2e conftest);
# the 900xxx test proposals have no data on disk
RECORDED_PROPOSALS = [6996, 900000, 900001, 900549]
# Keep roscar/1101 around since I can consent for myself (and my id is cool),
# only retain IDs for some of the others (PIs/proposers/contacts)
RECORDED_USERS = [5, 53, 146, 175, 204, 210, 250, 1101, 1271, 3214]
RECORDED_USERNAMES = ["roscar"]
# 356 is in cycle 6996, the rest are commissioning proposals/cycles
RECORDED_CYCLES = [1, 2, 356, 474]
