"""Metadata services."""

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from anyio import Path as APath
from sqlmodel import col, select

from .. import get_logger
from ..shared.errors import ForbiddenError
from ..shared.models import ProposalNumber
from .models import ProposalMeta, ProposalMetaBase

logger = get_logger()

if TYPE_CHECKING:
    from .._db.dependencies import DBSession
    from .._mymdc.clients import MyMdCClient
    from ..auth.dependencies import User


async def _fetch_proposal_meta(
    client: "MyMdCClient", proposal_number: ProposalNumber
) -> ProposalMetaBase:
    """Get proposal metadata by proposal number, using the provided MyMdC Client."""
    proposal = await client.get_proposal_by_number(proposal_number)
    cycle = await client.get_cycle_by_id(proposal.instrument_cycle_id)

    # This **should** always be the raw path,
    # e.g. `/gpfs/exfel/exp/SCS/202131/p900212/raw`
    path_raw = Path(proposal.def_proposal_path)

    if path_raw.parts[-1] != "raw":
        # Unless it's not
        if "/d/raw/" in str(path_raw):
            # e.g. `/gpfs/exfel/d/raw/XMPL/202550/p700005`
            path_raw = Path(str(path_raw).replace("/d/raw/", "/exp/"))
        elif path_raw.parts[-1].startswith("p"):
            # e.g. `/gpfs/exfel/exp/XMPL/202550/p700005`
            path_raw = path_raw / "raw"
        else:
            msg = f"Unexpected proposal path format: {path_raw!s}"
            # TODO: better exception
            raise ValueError(msg)

    path = path_raw.parent  # gpfs proposal directory

    try:
        path_read_only = (await APath(path).stat()).st_mode & 0o222 == 0
    except Exception:
        path_read_only = False

    start_date = proposal.beamtime_start_at or proposal.begin_at
    end_date = proposal.beamtime_end_at or proposal.end_at

    await logger.ainfo("Proposal metadata", path=path)

    damnit_path, damnit_paths_searched = await _search_damnit_dir(path)

    await logger.adebug(
        "Damnit path info",
        damnit_path=damnit_path,
        damnit_paths_searched=[str(p.relative_to(path)) for p in damnit_paths_searched],
    )

    principal_investigator = None
    if proposal.users_info:
        for user in proposal.users_info:
            if user.user_id == proposal.principal_investigator_id:
                principal_investigator = user.name
                break

    if not principal_investigator:
        pi = await client.get_user_by_id(proposal.principal_investigator_id)
        if pi:
            principal_investigator = pi.name

    return ProposalMetaBase(
        id=proposal.id,
        number=proposal.number,
        cycle=cycle.identifier,
        instrument=proposal.instrument_identifier,
        path=str(path),
        title=proposal.title,
        principal_investigator=principal_investigator or "Unknown",
        start_date=datetime.fromisoformat(start_date) if start_date else None,
        end_date=datetime.fromisoformat(end_date) if end_date else None,
        damnit_path=str(damnit_path) if damnit_path else None,
        damnit_paths_searched=[str(p) for p in damnit_paths_searched],
        proposal_read_only=path_read_only,
        damnit_path_last_check=datetime.now(tz=UTC),
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


async def _check_user_allowed(
    proposal_number: ProposalNumber,
    user: "User",
) -> None:
    """Check if the user is allowed to access the given proposal number.

    Raises `ForbiddenError` if not allowed.
    """
    if proposal_number not in user._proposals:
        msg = (
            f"User not authorised for proposal {proposal_number}, or proposal does not "
            "exist."
        )
        details = None
        if user._proposals is None:
            details = "User has no authorised proposals."
        await logger.ainfo(
            "Forbidden",
            message=msg,
            details=details,
        )
        raise ForbiddenError(msg, details=details)

    return


async def _get_proposal_meta(
    client: "MyMdCClient",
    proposal_number: ProposalNumber,
    session: "DBSession",
) -> ProposalMeta:
    """Get proposal metadata by proposal number, using the repository and/or provided
    MyMdC Client."""

    statement = select(ProposalMeta).where(ProposalMeta.number == proposal_number)
    result = (await session.exec(statement)).one_or_none()

    if result:
        await logger.ainfo(
            "Loaded proposal metadata from repository", proposal=proposal_number
        )
        return result

    fetched = await _fetch_proposal_meta(client, proposal_number)
    result = ProposalMeta(**fetched.model_dump())
    session.add(result)
    await session.commit()
    return result


def _chunks(list_, n=10):
    for i in range(0, len(list_), n):
        yield list_[i : i + n]


async def _get_proposal_meta_many(
    client: "MyMdCClient",
    proposal_numbers: list[ProposalNumber],
    session: "DBSession",
    only_with_damnit: bool = True,
    start_after: datetime | None = None,
) -> list[ProposalMeta]:
    statement = select(ProposalMeta).where(
        col(ProposalMeta.number).in_(proposal_numbers)
    )

    filters = []
    if only_with_damnit:
        filters.append(lambda p: p.damnit_path is not None)

    if start_after:
        filters.append(lambda p: p.start_date and p.start_date >= start_after)

    results = list((await session.exec(statement)).all())
    missing = set(proposal_numbers) - {p.number for p in results}

    if not missing:
        return [p for p in results if all(f(p) for f in filters)]

    for chunk in _chunks(list(missing), n=10):
        new_fetched = await asyncio.gather(
            *[_fetch_proposal_meta(client, no) for no in chunk],
            return_exceptions=True,
        )
        new = [
            ProposalMeta(**p.model_dump())
            for p in new_fetched
            if not isinstance(p, BaseException)
        ]
        session.add_all(new)
        await session.commit()
        results.extend(new)

    return [p for p in results if all(f(p) for f in filters)]


async def get_proposal_meta(
    client: "MyMdCClient",
    proposal_number: ProposalNumber,
    user: "User",
    session: "DBSession",
) -> ProposalMeta:
    """Get proposal metadata by proposal number, using the repository and/or provided
    MyMdC Client."""

    await _check_user_allowed(proposal_number, user)

    return await _get_proposal_meta(client, proposal_number, session)


async def _update_proposal_meta(
    client: "MyMdCClient",
    proposal_number: ProposalNumber,
    session: "DBSession",
) -> ProposalMeta:
    fetched = await _fetch_proposal_meta(client, proposal_number)

    # Upsert into DB
    statement = select(ProposalMeta).where(ProposalMeta.number == proposal_number)
    result = (await session.exec(statement)).one_or_none()

    if not result:
        new = ProposalMeta(**fetched.model_dump())
        session.add(new)
        await session.commit()
        return new

    for key, value in fetched.model_dump().items():
        if getattr(result, key) != value:
            setattr(result, key, value)

    await session.commit()
    await session.refresh(result)

    return result


async def update_proposal_meta(
    client: "MyMdCClient",
    proposal_number: ProposalNumber,
    user: "User",
    session: "DBSession",
) -> ProposalMeta:
    """Get proposal metadata by proposal number, using the repository and/or provided
    MyMdC Client."""

    await _check_user_allowed(proposal_number, user)

    return await _update_proposal_meta(client, proposal_number, session)


async def update_proposal_meta_many(
    client: "MyMdCClient",
    proposal_numbers: list[ProposalNumber],
    user: "User",
    session: "DBSession",
) -> list[ProposalMeta]:
    """Get proposal metadata by proposal number, using the repository and/or provided
    MyMdC Client."""

    for proposal_number in proposal_numbers:
        await _check_user_allowed(proposal_number, user)

    results = []
    for chunk in _chunks(proposal_numbers, n=10):
        new_fetched = await asyncio.gather(
            *[_update_proposal_meta(client, no, session) for no in chunk],
            return_exceptions=True,
        )
        results.extend([p for p in new_fetched if not isinstance(p, BaseException)])

    return results
