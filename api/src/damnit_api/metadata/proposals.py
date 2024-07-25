from contextlib import suppress
from datetime import datetime
import json
from pathlib import Path
import re

from .mymdc import MyMDC


DAMNIT_PROPOSALS_CACHE = "/tmp/damnit_proposals.json"


def get_available_proposals(user_groups, use_cache=True) -> list[str]:
    all_proposals = get_damnit_proposals(use_cache)
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
    for path in get_damnit_paths():
        proposal_num = get_proposal_number_from_path(path)
        info = mymdc.fetch_proposal_info(proposal_num)
        proposals[proposal_num] = {
            "proposal_path": info["def_proposal_path"],
            "damnit_path": path,
            "number": info["number"],
            "instrument": info["instrument_identifier"],
            "title": info["title"],
            "start_date": info["begin_at"],
            "end_date": info["end_at"],
            "run_cycle": get_run_cycle(info["end_at"]),
        }

    # Sort by proposal number
    proposals = dict(sorted(proposals.items()))

    # Write to file
    with open(DAMNIT_PROPOSALS_CACHE, "w") as file:
        json.dump(proposals, file)

    return proposals


def get_damnit_paths() -> list[str]:
    paths = []
    exp = Path("/gpfs/exfel/exp/")
    for path in exp.glob("*/202401/*"):
        ush = path / "usr/Shared"

        with suppress(PermissionError):
            for p in ush.glob("amore"):
                if p.is_dir():
                    paths.append(str(p))
            for p in ush.glob("amore-online"):
                if p.is_dir():
                    paths.append(str(p))
    return paths


def get_proposal_number_from_path(path: str) -> str:
    return path.split("/")[6].lstrip("p0")


def get_run_cycle(date) -> str:
    obj = datetime.fromisoformat(date)
    half_year = "01" if obj.month <= 6 else "02"
    return f"{obj.year}{half_year}"
