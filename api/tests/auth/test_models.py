"""Unit tests for reading the logged-in user from the session."""

import pytest
from fastapi.requests import HTTPConnection

from damnit_api.auth.models import OAuthUserInfo
from damnit_api.shared.errors import UnauthenticatedError


def test_a_session_user_without_a_username_is_unauthenticated():
    # The API finds the user's proposals in MyMdC by this name
    user = {
        "email": "jane@example.com",
        "family_name": "Doe",
        "given_name": "Jane",
        "name": "Jane Doe",
    }
    connection = HTTPConnection({"type": "http", "session": {"user": user}})

    with pytest.raises(UnauthenticatedError):
        OAuthUserInfo.from_connection(connection)
