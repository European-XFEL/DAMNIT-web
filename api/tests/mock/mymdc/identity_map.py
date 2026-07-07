"""Real to fake identity mapping for scrubbing recorded MyMdC data.

This is shared by the recorder (`record.py`), the e2e test user
(`tests/refactor/e2e/conftest.py`), and the (future) fixture-dataset generator, so
cassettes, mock responses, and on-disk fixtures always agree.
"""

# Usernames rewritten wherever they appear (request paths and response bodies)
USERNAMES = {
    "roscar": "e2etester",
}

# Replacement values applied to user records by key.
FAKE_USER = {
    "email": "e2e-tester@example.org",
    "contact_email": "e2e-tester@example.org",
    "first_name": "E2e",
    "last_name": "Tester",
    "name": "E2e Tester",
    "nickname": "e2etester",
    "uid": "e2etester",
}

# Every entity the cassette may contain. User proposal lists are truncated to
# RECORDED_PROPOSALS at scrub time.
# 6996 is the fixture-data proposal (tests/mock/data/p6996); the 900xxx test
# proposals have no data on disk.
RECORDED_PROPOSALS = [6996, 900000, 900001, 900549]
RECORDED_USERS = [1101]
RECORDED_USERNAMES = ["roscar"]
# 356 is in cycle 6996, the rest are commissioning proposals/cycles
RECORDED_CYCLES = [1, 2, 356, 474]
