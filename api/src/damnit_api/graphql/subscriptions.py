import json
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any

import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info

from .. import get_logger
from ..auth.permissions import PROPOSAL_PERMISSIONS
from ..runs.types import Timestamp
from ..shared.errors import DataUnavailableError
from .publisher import proposal_channel
from .utils import DatabaseInput

if TYPE_CHECKING:
    from litestar.channels import ChannelsPlugin

    from .publisher import RunUpdatePublisher

logger = get_logger()


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
        """Stream new-run snapshots for a proposal.

        Consumes the proposal's run-updates channel; how events are produced
        (SQLite poller today, pg-notify/Kafka later) is the publisher's
        concern (ADR-009). Late joiners are handled by the per-client
        `timestamp` filter, not by the channel.
        """
        proposal_number = database.proposal
        channels: ChannelsPlugin = info.context.channels
        publisher: RunUpdatePublisher = info.context.run_update_publisher

        publisher.watch(proposal_number)

        async with channels.start_subscription(
            proposal_channel(proposal_number)
        ) as subscriber:
            async for raw in subscriber.iter_events():
                event = json.loads(raw)
                if error := event.get("error"):
                    raise DataUnavailableError(error["message"])
                # Channel events are JSON-encoded; restore the integer run
                # keys the payload contract uses.
                event["runs"] = {int(k): v for k, v in event["runs"].items()}
                event["run_timestamps"] = {
                    int(k): v for k, v in event["run_timestamps"].items()
                }
                result = filter_for_client(event, timestamp)
                if result is not None:
                    yield result  # ty: ignore[invalid-yield]
