import strawberry
from sqlalchemy import and_, func, select
from strawberry.scalars import JSON
from strawberry.types import Info
from strawberry.types.nodes import SelectedField

from .. import get_logger
from ..auth.permissions import PROPOSAL_PERMISSIONS
from ..metadata.services import _get_proposal_meta, _update_proposal_meta
from ..runs.preview import get_preview_data
from ..runs.sqlite import async_table, get_session
from ..runs.types import KNOWN_DTYPES, DamnitRun
from .metadata import fetch_metadata
from .utils import DatabaseInput, fetch_info

logger = get_logger()

# Names that only `fetch_info` provides; `proposal` and `run` already come
# from `fetch_cells`.
RUN_INFO_NAMES = frozenset(KNOWN_DTYPES) - {"proposal", "run"}


async def _ensure_damnit_path(info: Info, proposal: str) -> None:
    """Ensure the proposal has a DAMNIT path, refreshing from MyMdC if needed.

    Authorization is handled separately by IsProposalMember before this runs.
    """
    from ..shared.settings import settings

    if settings.is_local:
        return

    meta = await _get_proposal_meta(
        info.context.mymdc, int(proposal), info.context.session
    )
    if not meta.damnit_path:
        logger.info("No damnit path found, updating proposal metadata")
        meta = await _update_proposal_meta(
            info.context.mymdc, int(proposal), info.context.session
        )
        if not meta.damnit_path:
            msg = "No damnit path found after updating proposal metadata."
            # TODO: custom exceptions
            raise ValueError(msg)


def group_by_run(record):
    grouped = {}

    for entry in record:
        key = (entry["proposal"], entry["run"])
        if key not in grouped:
            grouped[key] = {
                "proposal": {"value": entry["proposal"]},
                "run": {"value": entry["run"]},
            }
        # Outer-join placeholder for a run with no matching cells.
        if entry["name"] is None:
            continue
        grouped[key][entry["name"]] = {
            "value": entry["value"],
            "summary_type": entry["summary_type"],
            "attributes": entry["attributes"],
        }

    return list(grouped.values())


async def fetch_cells(proposal, *, limit, offset, names=None):
    table = await async_table(proposal, name="run_variables")
    if table is None:
        return []

    runs_subquery = (
        select(table.c.proposal, table.c.run)
        .distinct()
        .order_by(table.c.run)
        .limit(limit)
        .offset(offset)
        .subquery()
    )

    latest_timestamp_subquery = select(
        table.c.proposal,
        table.c.run,
        table.c.name,
        func.max(table.c.timestamp).label("latest_timestamp"),
    ).where(table.c.run.in_(select(runs_subquery.c.run)))
    if names is not None:
        latest_timestamp_subquery = latest_timestamp_subquery.where(
            table.c.name.in_(names)
        )
    latest_timestamp_subquery = latest_timestamp_subquery.group_by(
        table.c.run, table.c.name
    ).subquery()

    # Outer-join from `runs_subquery` so a `names` filter that excludes every
    # row of a paginated run still keeps the run in the page.
    query = (
        select(
            runs_subquery.c.proposal,
            runs_subquery.c.run,
            latest_timestamp_subquery.c.name,
            table.c.value,
            table.c.summary_type,
            table.c.attributes,
        )
        .select_from(runs_subquery)
        .outerjoin(
            latest_timestamp_subquery,
            runs_subquery.c.run == latest_timestamp_subquery.c.run,
        )
        .outerjoin(
            table,
            and_(
                table.c.proposal == latest_timestamp_subquery.c.proposal,
                table.c.run == latest_timestamp_subquery.c.run,
                table.c.name == latest_timestamp_subquery.c.name,
                table.c.timestamp == latest_timestamp_subquery.c.latest_timestamp,
            ),
        )
        .order_by(runs_subquery.c.run)
    )

    async with get_session(proposal) as session:
        result = await session.execute(query)
        if not result:
            raise ValueError  # TODO: Better error handling

        return group_by_run(result.mappings().all())  # type: ignore[assignment]


def _selected_cell_names(info: Info) -> list[str] | None:
    """Union the `names` arguments across every `cells` sub-selection.
    Returns None if any selection omits the argument (forces a full fetch).
    """
    union = set()
    found = False
    for selected in info.selected_fields:
        for sub in selected.selections:
            if not isinstance(sub, SelectedField) or sub.name != "cells":
                continue
            found = True
            arg = sub.arguments.get("names")
            if arg is None:
                return None
            union.update(arg)
    return sorted(union) if found else None


def _wants_run_info(names: list[str] | None) -> bool:
    if names is None:
        return True
    return bool(set(names) & RUN_INFO_NAMES)


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

        If the `cells` sub-selection passes a `names` argument, it is
        pushed down to SQL so only those cells are fetched. Omitting the
        argument returns every cell for each run.
        """
        proposal = database.proposal
        await _ensure_damnit_path(info, proposal)
        names = _selected_cell_names(info)

        cells = await fetch_cells(
            proposal,
            limit=per_page,
            offset=(page - 1) * per_page,
            names=names,
        )

        if not len(cells):
            return []

        if _wants_run_info(names):
            info_rows = await fetch_info(
                proposal, runs=[c["run"]["value"] for c in cells]
            )
        else:
            info_rows = [{} for _ in cells]

        return [
            DamnitRun.from_db({**c, **i}) for c, i in zip(cells, info_rows, strict=True)
        ]

    @strawberry.field(permission_classes=PROPOSAL_PERMISSIONS)
    async def metadata(
        self,
        info: Info,
        database: DatabaseInput,
    ) -> JSON:  # FIX: # pyright: ignore[reportInvalidTypeForm]
        proposal = database.proposal
        if not proposal:
            msg = "Proposal number is required."
            # TODO: custom exceptions
            raise ValueError(msg)

        await _ensure_damnit_path(info, proposal)

        snapshot = await fetch_metadata(proposal)
        return {
            **snapshot,
            "timestamp": snapshot["timestamp"] * 1000,  # ms for JS
        }  # pyright: ignore[reportReturnType]

    # Nullable, because a preview asks for many runs in one request, aliasing
    # this field once per run. A non-null field that raises propagates the null
    # up to the root, so a single unreadable run would take every other run in
    # the request down with it.
    @strawberry.field(permission_classes=PROPOSAL_PERMISSIONS)
    async def extracted_data(
        self,
        info: Info,
        database: DatabaseInput,
        run: int,
        variable: str,
    ) -> JSON | None:  # FIX: # pyright: ignore[reportInvalidTypeForm]
        await _ensure_damnit_path(info, database.proposal)
        # TODO: Convert to Strawberry type
        # and make it analogous to Cell; e.g. `data`
        return get_preview_data(  # FIX: # pyright: ignore[reportReturnType]
            proposal=database.proposal,
            run=run,
            variable=variable,
        )
