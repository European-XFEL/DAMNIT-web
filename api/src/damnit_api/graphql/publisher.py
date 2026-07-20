"""Run-update publishers: composition-selected producers of channel events.

Subscription resolvers consume per-proposal channels (ADR-009); exactly one
publisher per deployment produces the events. The SQLite poller below is the
default; a Postgres LISTEN/NOTIFY consumer or a Kafka bridge slot in behind
the same contract in the composition root (ADR-008) without touching
subscribers.
"""

import asyncio
import dataclasses
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

from .. import get_logger
from ..runs.types import DamnitRun
from ..shared.models import ProposalNumber

if TYPE_CHECKING:
    from litestar.channels import ChannelsPlugin

    from ..runs.repository import DamnitRepositoryRegistry

logger = get_logger()

POLLING_INTERVAL = 1.0  # seconds
MAX_CONSECUTIVE_FAILURES = 5


def proposal_channel(proposal_number: ProposalNumber) -> str:
    """Name of the run-updates channel for a proposal."""
    return f"proposal:{proposal_number}"


# `runtime_checkable` so Litestar's msgspec-based signature validation
# (`isinstance` on injected Protocols) doesn't raise on every request.
@runtime_checkable
class RunUpdatePublisher(Protocol):
    """Produce run-update events on per-proposal channels.

    The event payload is the snapshot dict consumed by `latest_data`
    (`runs`/`run_timestamps`/`max_timestamp`/`metadata`), or
    `{"error": {...}}` when the publisher gives up on a proposal.
    """

    def watch(self, proposal_number: ProposalNumber) -> None: ...
    async def aclose(self) -> None: ...


class SqlitePollingRunUpdatePublisher:
    """Polls DAMNIT databases and publishes new-run snapshots per proposal.

    One poll task per watched proposal regardless of subscriber count —
    coalescing is structural (one publisher, N channel subscribers). The
    per-proposal high-water mark keeps poll cost proportional to new data;
    it is an implementation detail of *this* publisher and is deleted with
    it under push-based backends (ADR-009).
    """

    def __init__(
        self,
        channels: "ChannelsPlugin",
        repositories: "DamnitRepositoryRegistry",
        *,
        interval: float = POLLING_INTERVAL,
        max_consecutive_failures: int = MAX_CONSECUTIVE_FAILURES,
    ) -> None:
        self._channels = channels
        self._repositories = repositories
        self._interval = interval
        self._max_consecutive_failures = max_consecutive_failures
        self._cursors: dict[ProposalNumber, float] = {}
        self._tasks: dict[ProposalNumber, asyncio.Task] = {}

    def watch(self, proposal_number: ProposalNumber) -> None:
        """Ensure a poll task is running for the proposal."""
        task = self._tasks.get(proposal_number)
        if task is None or task.done():
            self._tasks[proposal_number] = asyncio.create_task(
                self._poll_loop(proposal_number)
            )

    async def aclose(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()

    async def _poll_loop(self, proposal_number: ProposalNumber) -> None:
        failures = 0
        while True:
            await asyncio.sleep(self._interval)
            try:
                snapshot = await self._poll(proposal_number)
            except Exception:
                failures += 1
                logger.exception(
                    "Run-update poll failed",
                    proposal=proposal_number,
                    consecutive_failures=failures,
                )
                if failures >= self._max_consecutive_failures:
                    # Persistent failure: tell subscribers to terminate with
                    # a typed error (ADR-001) instead of silently going quiet.
                    self._channels.publish(
                        {
                            "error": {
                                "message": (
                                    "Run updates unavailable after "
                                    f"{failures} consecutive poll failures"
                                ),
                            }
                        },
                        proposal_channel(proposal_number),
                    )
                    self._tasks.pop(proposal_number, None)
                    return
                continue

            failures = 0
            if snapshot is not None:
                self._channels.publish(snapshot, proposal_channel(proposal_number))

    async def _poll(self, proposal_number: ProposalNumber) -> dict[str, Any] | None:
        """One poll tick: return a snapshot of rows newer than the cursor."""
        repo = self._repositories.get(proposal_number)

        # Initialize cursor from the current max timestamp on first visit
        if proposal_number not in self._cursors:
            metadata = await repo.get_metadata()
            self._cursors[proposal_number] = metadata.timestamp

        start_at = self._cursors[proposal_number]
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
        metadata = await repo.get_metadata()
        self._cursors[proposal_number] = latest_ts
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
