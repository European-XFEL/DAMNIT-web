import asyncio
import re
from pathlib import Path

from fastapi import Request
import ldap
from async_lru import alru_cache

from ..acl.models import ACL
from .models import Group, Resource, User

_LDAP = ldap.initialize("ldap://ldap.desy.de")  # TODO: put in config
_LDAP_BASE = "ou=people,ou=rgy,o=DESY,c=DE"  # TODO: put in config
_GROUP_NAME_RE = re.compile(r"cn=([^,]+)")


@alru_cache(ttl=60)
async def user_from_ldap(username: str) -> User:
    """Get user information from LDAP."""
    loop = asyncio.get_event_loop()
    res = await loop.run_in_executor(
        None,
        lambda: _LDAP.search_s(
            _LDAP_BASE,
            2,
            f"(uid={username})",
            ["uidNumber", "cn", "mail", "isMemberOf"],
        ),
    )

    if not res:
        raise Exception  # TODO: better exception

    res = res[0][1]

    name = res["cn"][0]
    email = res["mail"][0]
    uid = res["uidNumber"][0]
    _groups = [_GROUP_NAME_RE.search(g.decode()) for g in res["isMemberOf"]]
    groups = [Group(gid=None, name=m.group(1)) for m in _groups if m]

    return User(
        uid=uid,
        username=username,
        name=name,
        email=email,
        groups=groups,
    )


async def user_from_session(request: Request) -> User:
    user = request.session.get("user")
    if not user:
        raise Exception  # TODO: better exception

    return await user_from_ldap(user["preferred_username"])


@alru_cache(ttl=60)
async def resource_from_path(path: Path) -> Resource:
    acl = await ACL.from_path(path)
    owner = path.owner()
    group = path.group()

    return Resource(path=path, acl=acl, owner=owner, group=group)
