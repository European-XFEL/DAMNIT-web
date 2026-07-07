from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    MetaData,
    Table,
    and_,
    desc,
    func,
    or_,
    select,
    text,
)
from sqlalchemy.exc import NoSuchTableError, SQLAlchemyError

from ... import get_logger
from ...shared.models import ProposalNumber
from ..models import (
    KNOWN_VARIABLES,
    MetadataSnapshot,
    RunRecord,
    TagInfo,
    VariableInfo,
    VariableValue,
)
from ..repository import DamnitRepository
from .session import DatabaseSessionManager

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger()


class SQLiteDamnitRepository(DamnitRepository):
    """SQLite-backed DamnitRepository for a single DAMNIT proposal.

    One instance per proposal. Holds its own `DatabaseSessionManager` and a short-lived
    metadata cache.

    Pass the class directly as the factory argument of `DamnitRepositoryRegistry`
    (bound to a `metadata_ttl` via `functools.partial`, e.g. in
    `state.create_repositories`). Its constructor accepts a single `ProposalNumber`.
    """

    def __init__(
        self, proposal_number: ProposalNumber, *, metadata_ttl: float = 10.0
    ) -> None:
        self._proposal = proposal_number
        self._db = DatabaseSessionManager(proposal_number)
        # Per-repo table-reflection cache (invalidateable, no global TTL)
        self._tables: dict[str, Table | None] = {}
        # Metadata TTL cache
        self._metadata_ttl = metadata_ttl
        self._metadata_cache: MetadataSnapshot | None = None
        self._metadata_cache_at: float = 0.0

    @asynccontextmanager
    async def _session(self) -> AsyncIterator[AsyncSession]:
        """Yield a read-only async session (PRAGMA query_only = ON)."""
        async with self._db.session() as session:
            await session.execute(text("PRAGMA query_only = ON"))
            yield session

    async def _get_table(self, name: str) -> Table | None:
        """Return the reflected SQLAlchemy `Table`, or `None` if absent."""
        if name not in self._tables:
            async with self._db.connect() as conn:
                try:
                    table = await conn.run_sync(
                        lambda c: Table(name, MetaData(), autoload_with=c)
                    )
                    self._tables[name] = table
                except NoSuchTableError:
                    logger.warning(
                        "Table not found in proposal database",
                        proposal=self._proposal,
                        table=name,
                    )
                    self._tables[name] = None
                    return None
        return self._tables[name]

    @property
    def proposal(self) -> ProposalNumber:
        return self._proposal

    def invalidate_metadata_cache(self) -> None:
        """Discard cached metadata; next `get_metadata` call re-fetches."""
        self._metadata_cache = None
        self._metadata_cache_at = 0.0

    async def get_proposal_number(self) -> str | None:
        """Read the raw ``proposal`` value out of this database's `metameta` table.

        Local/dev mode has no MyMdC to ask "which proposal is this?", so
        `metadata.services._local_proposal_number` reads it back out of the
        DAMNIT database itself. Not part of the `DamnitRepository` ABC: the
        `metameta` table is a DAMNIT/sqlite-specific artefact with no CSV
        (or future backend) equivalent. Returns the raw string value (or
        `None` if the table/row is absent) — parsing into a `ProposalNumber`
        and handling invalid values is the caller's job.
        """
        table = await self._get_table("metameta")
        if table is None:
            return None
        async with self._session() as session:
            result = await session.execute(
                select(table.c.value).where(table.c.key == "proposal")
            )
            return result.scalar()

    async def _all_tags(self) -> dict[int, dict[str, Any]]:
        table = await self._get_table("tags")
        if table is None:
            return {}
        async with self._session() as session:
            result = await session.execute(select(table.c.id, table.c.name))
            return {
                row["id"]: {"id": row["id"], "name": row["name"]}
                for row in result.mappings().all()
            }

    async def _variables_meta(self) -> dict[str, dict[str, Any]]:
        table = await self._get_table("variables")
        if table is None:
            return {}
        async with self._session() as session:
            result = await session.execute(select(table.c.name, table.c.title))
            return {
                row["name"]: {"name": row["name"], "title": row["title"]}
                for row in result.mappings().all()
            }

    async def _variable_tags(self) -> dict[str, list[int]]:
        table = await self._get_table("variable_tags")
        if table is None:
            return {}
        async with self._session() as session:
            result = await session.execute(
                select(table.c.variable_name, table.c.tag_id)
            )
            out: dict[str, list[int]] = defaultdict(list)
            for row in result.mappings().all():
                out[row["variable_name"]].append(row["tag_id"])
            return dict(out)

    async def _run_ids(self) -> list[int]:
        table = await self._get_table("run_info")
        if table is None:
            return []
        async with self._session() as session:
            result = await session.execute(select(table.c.run))
            return list(result.scalars().all())

    async def _max_timestamp(self) -> float | None:
        table = await self._get_table("run_variables")
        if table is None:
            return None
        async with self._session() as session:
            result = await session.execute(select(func.max(table.c.timestamp)))
            return result.scalar()

    async def _fetch_run_info(self, run_ids: list[int]) -> dict[int, Any]:
        info_map: dict[int, Any] = {}
        if not run_ids:
            return info_map
        info_table = await self._get_table("run_info")
        if info_table is None:
            return info_map
        conditions = [info_table.c.run == r for r in run_ids]
        async with self._session() as session:
            result = await session.execute(
                select(info_table).where(or_(*conditions)).order_by(info_table.c.run)
            )
            for row in result.mappings().all():
                info_map[row["run"]] = row
        return info_map

    async def get_runs(
        self,
        *,
        limit: int,
        offset: int,
        variable_names: list[str] | None = None,
    ) -> list[RunRecord]:
        table = await self._get_table("run_variables")
        if table is None:
            return []

        # Paginated set of distinct (proposal, run) pairs
        runs_subquery = (
            select(table.c.proposal, table.c.run)
            .distinct()
            .order_by(table.c.run)
            .limit(limit)
            .offset(offset)
            .subquery()
        )

        # Latest timestamp per (run, variable), optionally filtered by name
        latest_ts_subquery = select(
            table.c.proposal,
            table.c.run,
            table.c.name,
            func.max(table.c.timestamp).label("latest_timestamp"),
        ).where(table.c.run.in_(select(runs_subquery.c.run)))
        if variable_names is not None:
            latest_ts_subquery = latest_ts_subquery.where(
                table.c.name.in_(variable_names)
            )
        latest_ts_subquery = latest_ts_subquery.group_by(
            table.c.run, table.c.name
        ).subquery()

        # Outer-join from runs_subquery so runs with no matching variables still appear
        query = (
            select(
                runs_subquery.c.proposal,
                runs_subquery.c.run,
                latest_ts_subquery.c.name,
                table.c.value,
                table.c.summary_type,
                table.c.attributes,
                table.c.timestamp,
            )
            .select_from(runs_subquery)
            .outerjoin(
                latest_ts_subquery,
                runs_subquery.c.run == latest_ts_subquery.c.run,
            )
            .outerjoin(
                table,
                and_(
                    table.c.proposal == latest_ts_subquery.c.proposal,
                    table.c.run == latest_ts_subquery.c.run,
                    table.c.name == latest_ts_subquery.c.name,
                    table.c.timestamp == latest_ts_subquery.c.latest_timestamp,
                ),
            )
            .order_by(runs_subquery.c.run)
        )

        async with self._session() as session:
            result = await session.execute(query)
            variable_rows = result.mappings().all()

        # Group rows by run
        run_variable_map: dict[int, dict[str, VariableValue]] = defaultdict(dict)
        run_proposals: dict[int, int] = {}
        for row in variable_rows:
            run = row["run"]
            run_proposals[run] = row["proposal"]
            if row["name"] is not None:
                run_variable_map[run][row["name"]] = VariableValue(
                    value=row["value"],
                    summary_type=row["summary_type"],
                    attributes=row.get("attributes"),
                    timestamp=row["timestamp"] or 0.0,
                )

        run_ids = list(run_proposals.keys())
        info_map = await self._fetch_run_info(run_ids)

        return [
            RunRecord(
                proposal=ProposalNumber(run_proposals[run]),
                run=run,
                start_time=info_map[run]["start_time"] if run in info_map else None,
                added_at=info_map[run]["added_at"] if run in info_map else None,
                variables=run_variable_map.get(run, {}),
            )
            for run in sorted(run_ids)
        ]

    async def get_latest_runs(
        self, *, start_at: float | None = None
    ) -> list[RunRecord]:
        if start_at is None:
            start_at = datetime.now().astimezone().timestamp()

        table = await self._get_table("run_variables")
        if table is None:
            return []

        selection = (
            select(table)
            .where(table.c.timestamp > start_at)
            .order_by(desc(table.c.timestamp))
        )
        async with self._session() as session:
            result = await session.execute(selection)
            rows = result.mappings().all()

        # Keep only the latest value per (run, variable)
        run_variable_map: dict[int, dict[str, VariableValue]] = defaultdict(dict)
        run_proposals: dict[int, int] = {}
        for row in rows:
            run = row["run"]
            run_proposals[run] = row["proposal"]
            name = row["name"]
            ts = row["timestamp"]
            existing = run_variable_map[run].get(name)
            if existing is None or ts > existing.timestamp:
                run_variable_map[run][name] = VariableValue(
                    value=row["value"],
                    summary_type=row.get("summary_type"),
                    attributes=row.get("attributes"),
                    timestamp=ts,
                )

        run_ids = list(run_proposals.keys())
        info_map = await self._fetch_run_info(run_ids)

        return [
            RunRecord(
                proposal=ProposalNumber(run_proposals[run]),
                run=run,
                start_time=info_map[run]["start_time"] if run in info_map else None,
                added_at=info_map[run]["added_at"] if run in info_map else None,
                variables=run_variable_map[run],
            )
            for run in sorted(run_ids)
        ]

    async def get_metadata(self) -> MetadataSnapshot:
        now = time.monotonic()
        if (
            self._metadata_cache is not None
            and now - self._metadata_cache_at < self._metadata_ttl
        ):
            return self._metadata_cache

        snapshot = await self._fetch_metadata()
        self._metadata_cache = snapshot
        self._metadata_cache_at = now
        return snapshot

    async def _fetch_metadata(self) -> MetadataSnapshot:
        try:
            (
                tags_raw,
                variables_raw,
                variable_tags_raw,
                run_ids_raw,
                max_ts,
            ) = await asyncio.gather(
                self._all_tags(),
                self._variables_meta(),
                self._variable_tags(),
                self._run_ids(),
                self._max_timestamp(),
            )
        except SQLAlchemyError:
            logger.exception(
                "Failed to fetch metadata for proposal",
                proposal=self._proposal,
            )
            raise

        # Build VariableInfo for DB-defined variables (with tag names resolved)
        db_variables: dict[str, VariableInfo] = {}
        for name, row in variables_raw.items():
            tag_names = []
            for tid in variable_tags_raw.get(name, []):
                tag_row = tags_raw.get(tid)
                if tag_row is None:
                    logger.warning(
                        "Tag id not found in tags table; skipping",
                        proposal=self._proposal,
                        tag_id=tid,
                    )
                    continue
                tag_names.append(tag_row["name"])
            db_variables[name] = VariableInfo(
                name=name, title=row["title"], tags=tag_names
            )

        # Known variables first; DB variables take precedence
        # (they carry resolved tag names)
        variables: dict[str, VariableInfo] = {
            v.name: VariableInfo(name=v.name, title=v.title) for v in KNOWN_VARIABLES
        }
        variables.update(db_variables)

        # Build TagInfo (prepend the "(Untagged)" tag)
        named_tags: dict[str, TagInfo] = {}
        for tid, tag_row in tags_raw.items():
            tag_name = tag_row["name"]
            var_names = [
                v_name for v_name, tids in variable_tags_raw.items() if tid in tids
            ]
            named_tags[tag_name] = TagInfo(id=tid, name=tag_name, variables=var_names)

        untagged_vars = [n for n, v in variables.items() if not v.tags]
        tags: dict[str, TagInfo] = {
            "(Untagged)": TagInfo(id=0, name="(Untagged)", variables=untagged_vars),
            **named_tags,
        }

        return MetadataSnapshot(
            runs=tuple(sorted(run_ids_raw)),
            variables=variables,
            tags=tags,
            timestamp=max_ts or 0.0,
        )

    async def get_extracted_data(self, *, run: int, variable: str) -> Any:
        from ..preview import get_preview_data

        loop = asyncio.get_running_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(
                    None, get_preview_data, self._proposal, run, variable
                ),
                timeout=30.0,
            )
        except TimeoutError:
            logger.exception(
                "Timed out fetching extracted data",
                proposal=self._proposal,
                run=run,
                variable=variable,
            )
            raise
        except Exception:
            logger.exception(
                "Failed to fetch extracted data",
                proposal=self._proposal,
                run=run,
                variable=variable,
            )
            raise
