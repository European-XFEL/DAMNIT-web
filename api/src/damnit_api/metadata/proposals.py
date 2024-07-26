from collections import defaultdict
from contextlib import suppress
from datetime import datetime
import json
from pathlib import Path
import re

from async_lru import alru_cache

from .mymdc import MyMDC


DAMNIT_PROPOSALS_CACHE = "/tmp/damnit_proposals.json"


@alru_cache(ttl=60)
async def get_proposal_info(proposal_num: str, use_cache: bool = True) -> dict:
    cache = Path(DAMNIT_PROPOSALS_CACHE)
    proposals = None

    # Check from cache if existing
    if use_cache and cache.exists():
        with open(DAMNIT_PROPOSALS_CACHE, "r") as file:
            # TODO: Update cache for new proposals
            proposals = json.load(file)
            if info := proposals.get(proposal_num):
                return info

    # Fetch information from MyMDC
    mymdc = MyMDC()
    info = mymdc.fetch_proposal_info(proposal_num)

    # Check if it has a DAMNIT folder
    root_path = format_proposal_path(info["def_proposal_path"])
    damnit_path = get_damnit_path(root_path, suffix="usr/Shared")
    if not damnit_path:
        return

    principal_investigator = mymdc.fetch_user(
        info["principal_investigator_id"]
    )
    info = format_proposal_info(
        info,
        damnit_path=damnit_path,
        principal_investigator=principal_investigator["name"],
    )

    if proposals is None:
        if cache.exists():
            with open(DAMNIT_PROPOSALS_CACHE, "r") as file:
                # TODO: Update cache for new proposals
                proposals = json.load(file)
        else:
            proposals = {}

    # Update the cache
    proposals[proposal_num] = info
    proposals = dict(sorted(proposals.items()))

    # Update the cache
    with open(DAMNIT_PROPOSALS_CACHE, "w") as file:
        json.dump(
            proposals,
            file,
            indent=4,
        )

    return info


def get_available_proposals(user_groups, use_cache=True) -> list[str]:
    all_proposals = get_damnit_proposals(use_cache)
    read_permissions = get_read_permissions(user_groups)
    read_permissions = [
        re.compile(permission.replace("*", ".*"))
        for permission in read_permissions
    ]

    proposals = {}
    for prop_num, info in all_proposals.items():
        if not any(
            permission.match(info["proposal_path"])
            for permission in read_permissions
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
    _sase_groups = {"sa1", "sa2", "sa3"}
    _las_groups = {"la1", "la2", "la3"}
    _instrument_groups = {"spb", "fxe", "hed", "mid", "scs", "sqs", "sxp"}

    instrument_groups = _sase_groups | _las_groups | _instrument_groups

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


def get_damnit_proposals(use_cache: bool) -> dict:
    cache = Path(DAMNIT_PROPOSALS_CACHE)
    if use_cache and cache.exists():
        with open(DAMNIT_PROPOSALS_CACHE, "r") as file:
            # TODO: Update cache for new proposals
            return json.load(file)

    mymdc = MyMDC()
    proposals = {}
    for damnit_path in get_damnit_paths():
        proposal_num = get_proposal_number_from_path(damnit_path)
        info = mymdc.fetch_proposal_info(proposal_num)
        principal_investigator = mymdc.fetch_user(
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
    with open(DAMNIT_PROPOSALS_CACHE, "w") as file:
        json.dump(
            proposals,
            file,
            indent=4,
        )

    return proposals


def get_damnit_paths() -> list[str]:
    paths = []
    exp = Path("/gpfs/exfel/exp/")
    for ush in exp.glob("**/usr/Shared"):
        if damnit := get_damnit_path(ush):
            paths.append(damnit)

    return paths


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
