import json
import re
from collections import defaultdict
from contextlib import suppress
from datetime import datetime
from pathlib import Path

import aiofiles
from async_lru import alru_cache

from ..settings import settings
from .mymdc import MyMDC


@alru_cache(ttl=60)
async def get_proposal_info(proposal_num: str, use_cache: bool = True) -> dict:
    cache = Path(settings.proposal_cache)
    proposals = None

    # Check from cache if existing
    if use_cache and cache.exists():
        async with aiofiles.open(settings.proposal_cache) as file:
            # TODO: Update cache for new proposals
            proposals = json.loads(await file.read())
            if info := proposals.get(proposal_num):
                return info

    # Fetch information from MyMDC
    async with MyMDC() as mymdc:
        info = await mymdc.fetch_proposal_info(proposal_num)

        # Check if it has a DAMNIT folder
        root_path = format_proposal_path(info["def_proposal_path"])
        damnit_path = get_damnit_path(root_path, suffix="usr/Shared")
        if not damnit_path:
            return None

        principal_investigator = await mymdc.fetch_user(
            info["principal_investigator_id"]
        )
        info = format_proposal_info(
            info,
            damnit_path=damnit_path,
            principal_investigator=principal_investigator["name"],
        )

    if proposals is None:
        if cache.exists():
            async with aiofiles.open(settings.proposal_cache) as file:
                # TODO: Update cache for new proposals
                proposals = json.loads(await file.read())
        else:
            proposals = {}

    # Update the cache
    proposals[proposal_num] = info
    proposals = dict(sorted(proposals.items()))

    # Update the cache
    async with aiofiles.open(settings.proposal_cache, mode="w") as file:
        json_str = json.dumps(proposals, indent=4)
        await file.write(json_str)

    return info


async def get_available_proposals(user_groups, use_cache=True) -> list[str]:
    all_proposals = await get_damnit_proposals(use_cache)
    read_permissions = get_read_permissions(user_groups)
    read_permissions = [
        re.compile(permission.replace("*", ".*")) for permission in read_permissions
    ]

    proposals = {}
    for prop_num, info in all_proposals.items():
        if not any(
            permission.match(info["proposal_path"]) for permission in read_permissions
        ):
            continue
        proposals[prop_num] = info

    return proposals


def sort_proposals_by_run_cycle(proposals, full=False):
    cycles = defaultdict(list)

    for num, info in proposals.items():
        run_cycle = info.get("run_cycle")
        cycles[run_cycle].append(info if full else num)

    return dict(sorted(cycles.items(), reverse=True))


def get_read_permissions(current_user_groups: list[str]) -> list[str]:
    """Return list of path glob expressions for proposals the user
    has read permissions for."""

    # Support staff
    support_groups = {"exfel_da", "exfel_cas"}
    if any(group in support_groups for group in current_user_groups):
        return ["/gpfs/exfel/exp/*"]

    read_permissions = []

    # Instrument staff
    sase_groups = {"sa1", "sa2", "sa3"}
    las_groups = {"la1", "la2", "la3"}
    instrument_groups_ = {"spb", "fxe", "hed", "mid", "scs", "sqs", "sxp"}

    instrument_groups = sase_groups | las_groups | instrument_groups_

    for _group in instrument_groups:
        group = f"{_group}DATA".lower()
        if group in current_user_groups:
            read_permissions.append(f"/gpfs/exfel/exp/{_group.upper()}/*")

    # Users
    proposals = [
        group.partition("-")[0]
        for group in current_user_groups
        if any([group.endswith("-dmgt"), group.endswith("-part")])
    ]

    for _proposal in proposals:
        proposal_number = _proposal.lstrip("6").lstrip("0").zfill(6)
        read_permissions.append(f"/gpfs/exfel/exp/*/*/p{proposal_number}")

    return read_permissions


async def get_damnit_proposals(use_cache: bool) -> dict:
    cache = Path(settings.proposal_cache)
    if use_cache and cache.exists():
        async with aiofiles.open(settings.proposal_cache) as file:
            # TODO: Update cache for new proposals
            return json.loads(await file.read())

    proposals = {}
    async with MyMDC() as mymdc:
        for damnit_path in get_damnit_paths():
            proposal_num = get_proposal_number_from_path(damnit_path)
            info = await mymdc.fetch_proposal_info(proposal_num)
            principal_investigator = await mymdc.fetch_user(
                info["principal_investigator_id"]
            )

            proposals[proposal_num] = format_proposal_info(
                info,
                damnit_path=damnit_path,
                principal_investigator=principal_investigator["name"],
            )

    # Sort by proposal number
    proposals = dict(sorted(proposals.items()))

    # Write to file
    if use_cache:
        async with aiofiles.open(settings.proposal_cache, mode="w") as file:
            json_str = json.dumps(proposals, indent=4)
            await file.write(json_str)

    return proposals


def get_damnit_paths() -> list[str]:
    exp = Path("/gpfs/exfel/exp/")
    return [
        damnit for ush in exp.glob("**/usr/Shared") if (damnit := get_damnit_path(ush))
    ]


def get_damnit_path(path: str | Path, suffix: str | None = None) -> str:
    """Try to check for existing DAMNIT folder
    under `<PROPOSAL_FOLDER>/usr/Shared` path"""

    ush = Path(path) / (suffix or "")

    with suppress(PermissionError):
        # We prioritize vanilla `amore` over `amore-online`
        for p in ush.glob("amore"):
            if p.is_dir():
                return str(p)
        for p in ush.glob("amore-online"):
            if p.is_dir():
                return str(p)

    return None


def get_proposal_number_from_path(path: str) -> str:
    return path.split("/")[6].lstrip("p0")


def format_proposal_info(info, **kwargs):
    return {
        "proposal_path": info["def_proposal_path"],
        "number": info["number"],
        "instrument": info["instrument_identifier"],
        "title": info["title"],
        "start_date": info["begin_at"],
        "end_date": info["end_at"],
        "run_cycle": get_run_cycle(info["end_at"]),
        **kwargs,
    }


def format_proposal_path(path: str | Path) -> str:
    return "/".join(str(path).split("/")[:7])


def get_run_cycle(date) -> str:
    obj = datetime.fromisoformat(date)
    half_year = "01" if obj.month <= 6 else "02"
    return f"{obj.year}{half_year}"
