"""Metadata services."""

from datetime import datetime
from pathlib import Path

from anyio import Path as APath

from .. import get_logger
from .._mymdc.clients import MyMdCClient
from ..shared.models import Instrument, ProposalNo
from .models import ProposalMeta

logger = get_logger(__name__)


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

    return ProposalMeta(
        # FIX: weird pyright errors
        no=proposal.number,  # pyright: ignore[reportArgumentType]
        path=path,
        cycle=cycle.identifier,  # pyright: ignore[reportArgumentType]
        instrument=Instrument(proposal.instrument_identifier),
        title=proposal.title,
        damnit_path=None,
        start_date=datetime.fromisoformat(proposal.beamtime_start_at),
        end_date=datetime.fromisoformat(proposal.beamtime_end_at),
    )


async def _search_damnit_dir(path: Path) -> Path | None:
    """Search for a DAMNIT directory in common locations relative to `path`.

    Looks for `usr/Shared/{amore,amore-online}` directories."""
    usr_share = APath(path) / "usr" / "Shared" / "amore"

    for dirs in ("amore", "amore-online"):
        try:
            damnit_path = damnit_path = usr_share.parent / dirs
            if await damnit_path.is_dir():
                return Path(damnit_path)

            await logger.adebug(f"No DAMNIT directory found at {damnit_path}")
        except PermissionError:
            await logger.adebug(
                f"Permission denied when accessing {usr_share.parent / dirs}"
            )
            continue

    return None


async def get_proposal_meta(
    client: MyMdCClient, proposal_no: ProposalNo
) -> ProposalMeta:
    """Get proposal metadata by proposal number, using the repository and/or provided
    MyMdC Client."""
    meta = await _get_proposal_meta(client, proposal_no)

    if damnit_path := await _search_damnit_dir(meta.path):
        meta.damnit_path = damnit_path

    return meta
