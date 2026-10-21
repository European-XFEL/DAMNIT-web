import asyncio
from collections.abc import AsyncGenerator

import strawberry
from async_lru import alru_cache

from .. import get_logger
from ..auth.permissions import PROPOSAL_PERMISSIONS
from ..runs.sqlite import async_latest_rows, async_max, async_table, get_database_mtime
from ..runs.types import DamnitRun, TableMeta, Timestamp
from .metadata import fetch_metadata
from .utils import DatabaseInput, LatestData, fetch_info

logger = get_logger()

POLLING_INTERVAL = 1  # seconds

# Server-side high-water mark per proposal so each tick only fetches rows
# newer than what the previous tick already shipped.
_last_seen_timestamp: dict[str, float] = {}


@strawberry.type
class RunUpdates:
    runs: list[DamnitRun]
    metadata: TableMeta | None
    timestamp: Timestamp


# The per-client cursor and file mtime are deliberately omitted from the cache
# key so that concurrent subscribers coalesce into a single DB read per tick.
@alru_cache(maxsize=32, ttl=POLLING_INTERVAL)
async def poll_proposal(proposal):
    # Stat'ed before the reads: a commit landing in between then costs one extra
    # poll, where a stat after them would hide it until the next write.
    mtime = await get_database_mtime(proposal)
    table = await async_table(proposal, name="run_variables")
    if table is None:
        return None

    if proposal not in _last_seen_timestamp:
        max_timestamp = await async_max(
            proposal, table="run_variables", column="timestamp"
        )
        _last_seen_timestamp[proposal] = max_timestamp or 0

    rows = await async_latest_rows(
        proposal,
        table=table,
        by="timestamp",
        start_at=_last_seen_timestamp[proposal],
    )

    # A subscriber polls on its first tick, then only once the file has changed, so any
    # write re-reads the metadata: a new run, a tag edit, a retitled variable.
    fetch_metadata.cache_invalidate(proposal)
    metadata = await fetch_metadata(proposal)

    runs = {}
    run_timestamps = {}

    if rows:
        latest_data = LatestData.from_list(rows)

        if latest_data.timestamp is None:
            msg = "Latest data has no timestamp."
            raise ValueError(msg)

        pairs = list(latest_data.runs.keys())
        info = await fetch_info(proposal, runs=pairs)

        for key, variables in latest_data.runs.items():
            run_proposal, run_number = key
            run_values = {
                name: {
                    "value": data.value,
                    "summary_type": data.summary_type,
                    "attributes": data.attributes,
                    "timestamp": data.timestamp,
                }
                for name, data in variables.items()
            }
            run_values.setdefault("proposal", {"value": run_proposal})
            run_values.setdefault("run", {"value": run_number})

            if run_info := info.get(key):
                run_values.update(run_info)

            runs[key] = DamnitRun.from_db(run_values, database=proposal)
            run_timestamps[key] = max(data.timestamp for data in variables.values())

        _last_seen_timestamp[proposal] = latest_data.timestamp

    return {
        "runs": runs,
        "run_timestamps": run_timestamps,
        "max_timestamp": _last_seen_timestamp[proposal],  # seconds
        "mtime": mtime,  # nanoseconds
        # The whole snapshot rides along so a subscriber that needs to push it
        # builds `TableMeta` from this exact metadata, rather than re-fetching and
        # racing a newer snapshot whose signature no longer matches. Whether this
        # is news is the subscriber's call, not ours: this poll is shared by every
        # subscriber of the proposal, so a verdict reached here would be delivered
        # to whichever one happened to fill the cache window and silently withheld
        # from the rest.
        "metadata": metadata,
        "metadata_signature": metadata["signature"],
    }


def filter_for_client(snapshot, since, metadata=None):
    # A cursorless client gets this tick's changed rows, not a history replay:
    # `poll_proposal` already bounds them by the server's high-water mark. Only
    # dropping them would be wrong, since a proposal with no runs seeds `since`
    # from a zero timestamp and would never advance past it.
    runs = [
        run
        for key, run in snapshot["runs"].items()
        if snapshot["run_timestamps"][key] > (since or 0)
    ]
    if not runs and metadata is None:
        return None
    return RunUpdates(
        runs=runs,
        metadata=metadata,
        timestamp=snapshot["max_timestamp"],
    )


@strawberry.type
class Subscription:
    @strawberry.subscription(permission_classes=PROPOSAL_PERMISSIONS)
    async def run_updates(
        self,
        database: DatabaseInput,
        since: Timestamp,
    ) -> AsyncGenerator[RunUpdates]:
        # Which metadata this client has seen, held here rather than per
        # proposal: the poll is shared, the delivery is not. The first tick
        # always pushes, which also closes the gap between the client's opening
        # metadata query and its subscribe.
        last_signature = None
        last_mtime = None
        failing = False

        while True:
            await asyncio.sleep(POLLING_INTERVAL)

            try:
                mtime = await get_database_mtime(database.proposal)

                # Compared with the mtime of the last poll, never with `since`: a
                # commit lands after it stamps its rows, so its mtime is newer.
                snapshot = None
                if mtime is None or mtime != last_mtime:
                    snapshot = await poll_proposal(proposal=database.proposal)
            except Exception as exc:
                if not failing:
                    logger.warning(
                        "Live update poll failed, retrying",
                        proposal=database.proposal,
                        error=repr(exc),
                        exc_info=True,
                    )
                failing = True
                continue

            failing = False

            # The file is unchanged, or has no table yet. A miss leaves `last_mtime`
            # as it was, since a cached one does not say when it was read.
            if snapshot is None:
                continue

            # The snapshot may be one another subscriber cached before this write, so
            # keep the mtime it was read at rather than this tick's.
            last_mtime = snapshot["mtime"]

            metadata = None
            if snapshot["metadata_signature"] != last_signature:
                last_signature = snapshot["metadata_signature"]
                metadata = TableMeta.from_snapshot(snapshot["metadata"])

            result = filter_for_client(snapshot, since, metadata)
            if result is not None:
                yield result
