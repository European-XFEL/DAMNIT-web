import asyncio
import re
from pathlib import Path

from async_lru import alru_cache
from fastapi import Request
from ldap3 import ALL, SUBTREE, Connection, Server

from .. import get_logger
from ..acl.models import ACL
from ..metadata.proposals import (
    get_available_proposals,
    sort_proposals_by_run_cycle,
)
from .models import Group, Resource, User

logger = get_logger()

_LDAP_SERVER = "ldap://ldap.desy.de"  # TODO: put in config
_LDAP_BASE = "ou=people,ou=rgy,o=DESY,c=DE"  # TODO: put in config
_GROUP_NAME_RE = re.compile(r"cn=([^,]+)")


@alru_cache(ttl=60)
async def user_from_ldap(username: str) -> User:
    """Get user information from LDAP."""
    server = Server(_LDAP_SERVER, get_info=ALL)
    conn = Connection(server, auto_bind=True)

    search_filter = f"(uid={username})"
    search_attributes = ["uidNumber", "cn", "mail", "isMemberOf"]

    _logger = logger.bind(username=username)

    _logger.debug(
        "LDAP search for user",
        ldap_bash=_LDAP_BASE,
        search_filter=search_filter,
        search_scope=SUBTREE,
        attributes=search_attributes,
    )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: conn.search(
            _LDAP_BASE,
            search_filter,
            search_scope=SUBTREE,
            attributes=search_attributes,
        ),
    )

    if not conn.entries:
        msg = "User not found"
        raise Exception(msg)  # TODO: better exception

    _logger.debug("LDAP search result", entries=conn.entries)

    entry = conn.entries[0]
    name = entry.cn.value
    email = entry.mail.value
    uid = entry.uidNumber.value

    # CC: Prolly we shouldn't use return the actual groups,
    # but the proposals and the r/w access.
    groups = []
    for g in entry.isMemberOf.value:
        res = _GROUP_NAME_RE.search(g)

        if not res:
            _logger.debug("Group not found", group=g)
            continue

        groups.append(res.group(1))

    # For now, let's also include the list of proposals.
    proposals = await get_available_proposals(groups)

    user = User(
        uid=uid,
        username=username,
        name=name,
        email=email,
        proposals=sort_proposals_by_run_cycle(proposals),
        groups=[Group(gid=None, name=group) for group in groups],
    )

    logger.debug("User from LDAP", user=user)

    return user


async def user_from_session(request: Request) -> User:
    user = request.session.get("user")

    logger.debug("User from session", user=user)

    if not user:
        raise Exception  # TODO: better exception

    return await user_from_ldap(user["preferred_username"])


@alru_cache(ttl=60)
async def resource_from_path(path: Path) -> Resource:
    acl = await ACL.from_path(path)
    owner = path.owner()
    group = path.group()

    logger.debug(
        "Resource from path", path=path, acl=acl, owner=owner, group=group
    )

    return Resource(path=path, acl=acl, owner=owner, group=group)
