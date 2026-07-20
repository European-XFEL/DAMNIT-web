import asyncio
import dataclasses
from collections.abc import AsyncGenerator
from typing import Any

import strawberry
from async_lru import alru_cache
from strawberry.scalars import JSON
from strawberry.types import Info

from .. import get_logger
from ..auth.permissions import PROPOSAL_PERMISSIONS
from ..runs.repository import DamnitRepository
from ..runs.types import DamnitRun, Timestamp
from ..shared.models import ProposalNumber
from .utils import DatabaseInput

logger = get_logger()

POLLING_INTERVAL = 1  # seconds


class SubscriptionCursors:
    """Server-side high-water mark per proposal so each tick only fetches rows
    newer than what the previous tick already shipped. Hashable by identity
    for alru_cache."""

    def __init__(self) -> None:
        self._data: dict[ProposalNumber, float] = {}

    def __contains__(self, proposal_number: ProposalNumber) -> bool:
        return proposal_number in self._data

    def __getitem__(self, proposal_number: ProposalNumber) -> float:
        return self._data[proposal_number]

    def __setitem__(self, proposal_number: ProposalNumber, value: float) -> None:
        self._data[proposal_number] = value

    def clear(self) -> None:
        self._data.clear()


# Per-client cursor is deliberately omitted from the cache key so that
# concurrent subscribers coalesce into a single DB read per tick.
@alru_cache(maxsize=32, ttl=POLLING_INTERVAL)
async def poll_proposal(
    proposal_number: ProposalNumber,
    cursors: SubscriptionCursors,
    repo: DamnitRepository,
) -> dict[str, Any] | None:
    # Initialise cursor from the current max timestamp on first visit.
    if proposal_number not in cursors:
        try:
            metadata = await repo.get_metadata()
            cursors[proposal_number] = metadata.timestamp
        except Exception:
            return None

    start_at = cursors[proposal_number]
    records = await repo.get_latest_runs(start_at=start_at)
    if not records:
        return None

    runs: dict[int, Any] = {}
    run_timestamps: dict[int, float] = {}
    for record in records:
        runs[record.run] = DamnitRun.resolve_record(record)
        if record.variables:
            run_timestamps[record.run] = max(
                vv.timestamp for vv in record.variables.values()
            )

    if not runs:
        return None

    latest_ts = max(run_timestamps.values(), default=start_at)

    repo.invalidate_metadata_cache()
    try:
        metadata = await repo.get_metadata()
    except Exception:
        return None
    cursors[proposal_number] = latest_ts
    meta_dict = dataclasses.asdict(metadata)

    return {
        "runs": runs,
        "run_timestamps": run_timestamps,
        "max_timestamp": latest_ts,
        "metadata": {
            "runs": sorted(set(metadata.runs) | set(runs.keys())),
            "variables": meta_dict["variables"],
            "timestamp": latest_ts * 1000,  # ms for JS
        },
    }


def filter_for_client(
    snapshot: dict[str, Any] | None,
    since: float | None,
) -> dict[str, Any] | None:
    if snapshot is None or not since or snapshot["max_timestamp"] <= since:
        return None
    runs = {
        run: value
        for run, value in snapshot["runs"].items()
        if snapshot["run_timestamps"][run] > since
    }
    if not runs:
        return None
    return {"runs": runs, "metadata": snapshot["metadata"]}


@strawberry.type
class Subscription:
    @strawberry.subscription(permission_classes=PROPOSAL_PERMISSIONS)
    async def latest_data(
        self,
        info: Info,
        database: DatabaseInput,
        timestamp: Timestamp,
    ) -> AsyncGenerator[JSON]:
        cursors: SubscriptionCursors = info.context.subscription_cursors
        while True:
            await asyncio.sleep(POLLING_INTERVAL)

            proposal = database.proposal
            try:
                repo = info.context.repositories.get(proposal)
                snapshot = await poll_proposal(
                    proposal_number=proposal,
                    cursors=cursors,
                    repo=repo,
                )
            except Exception:
                logger.exception("Subscription poll failed", proposal=proposal)
                raise

            result = filter_for_client(snapshot, timestamp)
            if result is not None:
                yield result  # ty: ignore[invalid-yield]
