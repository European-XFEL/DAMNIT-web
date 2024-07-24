from contextlib import suppress
import re
from pathlib import Path


def get_available_proposals(user_groups, full_path=False) -> list[str]:
    all_proposals = get_damnit_proposals()
    read_permissions = get_read_permissions(user_groups)
    read_permissions = [re.compile(permission.replace('*', '.*'))
                        for permission in read_permissions]
    proposals = []
    for proposal in all_proposals:
        proposal = str(proposal)
        if not any(permission.match(proposal)
                   for permission in read_permissions):
            continue
        proposals.append(proposal if full_path else proposal.split('/')[6])

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


def get_damnit_proposals() -> list[str]:
    cache = Path("/tmp/damnit_proposals")
    if cache.exists():
        with cache.open() as f:
            return f.read().splitlines()

    exp = Path("/gpfs/exfel/exp/")
    amore = []

    for path in exp.glob("*/202401/*"):
        ush = path / "usr/Shared"

        with suppress(PermissionError):
            for p in ush.glob("amore"):
                if p.is_dir():
                    amore.append(p)
            for p in ush.glob("amore-online"):
                if p.is_dir():
                    amore.append(p)

    amore.sort()

    with cache.open("w") as f:
        f.write("\n".join(str(p) for p in amore))

    return amore
