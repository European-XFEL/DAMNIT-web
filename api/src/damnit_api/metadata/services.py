"""Metadata services."""

from datetime import datetime
from pathlib import Path

from anyio import Path as APath

from .. import get_logger
from .._mymdc.clients import MyMdCClient
from ..auth.dependencies import User
from ..shared.errors import ForbiddenError
from ..shared.models import ProposalNo
from .models import ProposalMeta

logger = get_logger()


async def _get_proposal_meta(
    client: MyMdCClient, proposal_no: ProposalNo
) -> ProposalMeta:
    """Get proposal metadata by proposal number, using the provided MyMdC Client."""
    proposal = await client.get_proposal_by_number(proposal_no)
    cycle = await client.get_cycle_by_id(proposal.instrument_cycle_id)

    # This **should** always be the raw path,
    # e.g. `/gpfs/exfel/exp/SCS/202131/p900212/raw`
    path_raw = Path(proposal.def_proposal_path)

    if path_raw.parts[-1] != "raw":
        msg = f"Unexpected proposal path format: {path_raw!s}"
        # TODO: better exception
        raise ValueError(msg)

    path = path_raw.parent  # gpfs proposal directory

    start_date = proposal.beamtime_start_at or proposal.begin_at
    end_date = proposal.beamtime_end_at or proposal.end_at

    await logger.ainfo("Proposal metadata", path=path)

    damnit_path, damnit_paths_searched = await _search_damnit_dir(path)

    await logger.adebug(
        "Damnit path info",
        damnit_path=damnit_path,
        damnit_paths_searched=[str(p.relative_to(path)) for p in damnit_paths_searched],
    )

    return ProposalMeta(
        no=proposal.number,
        path=path,
        cycle=cycle.identifier,
        instrument=proposal.instrument_identifier,
        damnit_path=damnit_path,
        damnit_paths_searched=damnit_paths_searched,
        title=proposal.title,
        start_date=datetime.fromisoformat(start_date) if start_date else None,
        end_date=datetime.fromisoformat(end_date) if end_date else None,
    )


async def _search_damnit_dir(path: Path) -> tuple[Path | None, list[Path]]:
    """Search for a DAMNIT directory in common locations relative to `path`.

    Looks for `usr/Shared/{amore,amore-online}` directories."""
    usr_share = APath(path) / "usr" / "Shared" / "amore"

    searched_paths = []
    for dir in ("amore", "amore-online"):
        try:
            damnit_path = damnit_path = usr_share.parent / dir
            searched_paths.append(Path(damnit_path))
            if await damnit_path.is_dir():
                return Path(damnit_path), searched_paths
        except PermissionError:
            await logger.awarning(
                f"Permission denied when accessing {usr_share.parent / dir}"
            )
            continue

    return None, searched_paths


async def get_proposal_meta(
    client: MyMdCClient,
    proposal_no: ProposalNo,
    user: User,
) -> ProposalMeta:
    """Get proposal metadata by proposal number, using the repository and/or provided
    MyMdC Client."""

    # TODO: caching layer/repository

    allowed_proposals = {p.proposal_number for p in user.proposals.root}

    if proposal_no not in allowed_proposals:
        msg = (
            f"User not authorised for proposal {proposal_no}, or proposal does not "
            "exist."
        )
        details = None
        if allowed_proposals is None:
            details = "User has no authorised proposals."
        await logger.ainfo(
            "Forbidden",
            message=msg,
            details=details,
        )
        raise ForbiddenError(msg, details=details)

    return await _get_proposal_meta(client, proposal_no)
