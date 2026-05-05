import strawberry
from sqlalchemy import and_, func, select
from strawberry.scalars import JSON
from strawberry.types import Info
from strawberry.types.nodes import SelectedField

from .. import get_logger
from ..auth.permissions import PROPOSAL_PERMISSIONS
from ..data import get_preview_data
from ..db import async_table, get_session
from ..metadata.services import get_proposal_meta, update_proposal_meta
from ..utils import wrap_values
from .metadata import fetch_metadata
from .models import KNOWN_DTYPES, DamnitRun
from .utils import DatabaseInput, fetch_info

logger = get_logger()

# Names that only `fetch_info` provides; `proposal` and `run` already come
# from `fetch_variables`.
RUN_INFO_NAMES = frozenset(KNOWN_DTYPES) - {"proposal", "run"}


async def _ensure_proposal_damnit_path(info: Info, proposal: str) -> None:
    """Resolve the user, check access, and ensure the proposal has a DAMNIT
    path. Refreshes from MyMdC if the cached metadata has no path.
    """
    user = await User.from_oauth_user(
        info.context.mymdc, info.context.session, info.context.oauth_user
    )
    meta = await get_proposal_meta(
        info.context.mymdc, int(proposal), user, info.context.session
    )
    if not meta.damnit_path:
        logger.info("No damnit path found, updating proposal metadata")
        meta = await update_proposal_meta(
            info.context.mymdc, int(proposal), user, info.context.session
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
            grouped[key] = wrap_values({
                "proposal": entry["proposal"],
                "run": entry["run"],
            })
        # Outer-join placeholder for a run with no matching variables.
        if entry["name"] is None:
            continue
        grouped[key][entry["name"]] = {
            "value": entry["value"],
            "summary_type": entry["summary_type"],
        }

    return list(grouped.values())


async def fetch_variables(proposal, *, limit, offset, names=None):
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

        If the `variables` sub-selection passes a `names` argument, it is
        pushed down to SQL so only those variables are fetched. Omitting the
        argument returns every variable for each run.
        """
        proposal = database.proposal
        names = _selected_variable_names(info)

        variables = await fetch_variables(
            proposal,
            limit=per_page,
            offset=(page - 1) * per_page,
            names=names,
        )

        if not len(variables):
            return []

        if _wants_run_info(names):
            info_rows = await fetch_info(
                proposal, runs=[v["run"]["value"] for v in variables]
            )
        else:
            info_rows = [{} for _ in variables]

        return [
            DamnitRun.from_db({**v, **wrap_values(i)})
            for v, i in zip(variables, info_rows, strict=True)
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

        await _ensure_proposal_damnit_path(info, proposal)

        snapshot = await fetch_metadata(proposal)
        return {
            **snapshot,
            "timestamp": snapshot["timestamp"] * 1000,  # ms for JS
        }  # pyright: ignore[reportReturnType]

    @strawberry.field(permission_classes=PROPOSAL_PERMISSIONS)
    def extracted_data(
        self, database: DatabaseInput, run: int, variable: str
    ) -> JSON:  # FIX: # pyright: ignore[reportInvalidTypeForm]
        # TODO: Convert to Strawberry type
        # and make it analogous to DamitVariable; e.g. `data`
        return get_preview_data(  # FIX: # pyright: ignore[reportReturnType]
            proposal=int(
                # FIXME: database.proposal is loosely typed
                database.proposal  # pyright: ignore[reportArgumentType, reportReturnType]
            ),
            run=run,
            variable=variable,
        )
