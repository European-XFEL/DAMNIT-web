import dataclasses

import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info
from strawberry.types.nodes import SelectedField

from .. import get_logger
from ..metadata.services import _get_proposal_meta, _update_proposal_meta
from ..runs.types import DamnitRun
from ..shared.models import ProposalNumber
from ..shared.permissions import PROPOSAL_PERMISSIONS
from .utils import DatabaseInput

logger = get_logger()


async def _ensure_damnit_path(info: Info, proposal: ProposalNumber) -> None:
    """Ensure the proposal has a DAMNIT path, refreshing from MyMdC if needed.

    Authorization is handled separately by IsProposalMember before this runs.
    """
    from ..shared.settings import settings

    if settings.is_local:
        return

    meta = await _get_proposal_meta(
        info.context.mymdc, proposal, info.context.session
    )
    if not meta.damnit_path:
        logger.info("No damnit path found, updating proposal metadata")
        meta = await _update_proposal_meta(
            info.context.mymdc, proposal, info.context.session
        )
        if not meta.damnit_path:
            msg = "No damnit path found after updating proposal metadata."
            # TODO: custom exceptions
            raise ValueError(msg)


def _selected_variable_names(info: Info) -> list[str] | None:
    """Union the `names` arguments across every `variables` sub-selection.
    Returns None if any selection omits the argument (forces a full fetch).
    """
    union = set()
    found = False
    for selected in info.selected_fields:
        for sub in selected.selections:
            if not isinstance(sub, SelectedField) or sub.name != "variables":
                continue
            found = True
            arg = sub.arguments.get("names")
            if arg is None:
                return None
            union.update(arg)
    return sorted(union) if found else None


@strawberry.type
class Query:
    """
    Defines the GraphQL queries for the Damnit API.
    """

    @strawberry.field(permission_classes=PROPOSAL_PERMISSIONS)
    async def runs(
        self,
        info: Info,
        database: DatabaseInput,
        page: int = 1,
        per_page: int = 10,
    ) -> list[DamnitRun]:
        """Return a paginated list of Damnit runs.

        If the `variables` sub-selection passes a `names` argument, it is
        pushed down to SQL so only those variables are fetched. Omitting the
        argument returns every variable for each run.
        """
        proposal = database.proposal
        await _ensure_damnit_path(info, proposal)
        names = _selected_variable_names(info)

        try:
            repo = info.context.repositories.get(proposal)
            records = await repo.get_runs(
                limit=per_page,
                offset=(page - 1) * per_page,
                variable_names=names,
            )
        except Exception:
            logger.exception("Failed to get runs", proposal=proposal)
            raise
        return [DamnitRun.from_record(r) for r in records]

    @strawberry.field(permission_classes=PROPOSAL_PERMISSIONS)
    async def metadata(
        self,
        info: Info,
        database: DatabaseInput,
    ) -> JSON:
        proposal = database.proposal
        await _ensure_damnit_path(info, proposal)

        try:
            repo = info.context.repositories.get(proposal)
            snapshot = await repo.get_metadata()
        except Exception:
            logger.exception("Failed to get metadata", proposal=proposal)
            raise
        result = dataclasses.asdict(snapshot)
        result["runs"] = list(result["runs"])
        result["timestamp"] = snapshot.timestamp * 1000  # ms for JS
        return result

    @strawberry.field(permission_classes=PROPOSAL_PERMISSIONS)
    async def extracted_data(
        self,
        info: Info,
        database: DatabaseInput,
        run: int,
        variable: str,
    ) -> JSON:
        proposal = database.proposal
        await _ensure_damnit_path(info, proposal)
        try:
            repo = info.context.repositories.get(proposal)
            return await repo.get_extracted_data(run=run, variable=variable)
        except Exception:
            logger.exception("Failed to get extracted data", proposal=proposal)
            raise
