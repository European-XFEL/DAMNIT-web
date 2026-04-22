import asyncio
import json
from collections.abc import AsyncGenerator

import strawberry
from aiokafka import AIOKafkaConsumer
from async_lru import alru_cache
from strawberry.scalars import JSON
from strawberry.types import Info

from ..db import (
    async_latest_rows,
    async_table,
    async_variables,
    async_config_value,
    async_changed_values,
)
from ..utils import create_map, wrap_values
from .models import Timestamp, get_model
from .utils import DatabaseInput, LatestData, fetch_info

POLLING_INTERVAL = 1  # seconds

KAFKA_BROKERS = ['exflwgs06.desy.de:9091']
KAFKA_UPDATE_TOPIC = "test.damnit.db-{}"


class DBWatcher:
    # The registry holds 1 DBWatcher per proposal, so we retrieve new values
    # from the database once, even if several clients are subscribed.
    registry: dict[str, 'DBWatcher'] = {}

    @classmethod
    async def queue_for_proposal(cls, proposal, schema):
        q = asyncio.Queue()
        if (watcher := cls.registry.get(proposal)) is None:
            watcher = cls(proposal, schema)
            watcher.task = asyncio.create_task(watcher.run())
        watcher.subscriptions.add(q)
        return q

    @classmethod
    def drop_queue(cls, proposal, queue):
        if (watcher := cls.registry.get(proposal)) is not None:
            watcher.subscriptions.discard(queue)
            if not watcher.subscriptions:
                del cls.registry[proposal]
                if watcher.task is not None:
                    watcher.task.cancel()

    def __init__(self, proposal, schema):
        self.proposal = proposal
        self.schema = schema
        self.subscriptions = set()
        self.task: asyncio.Task | None = None

    def notify(self, d: dict):
        for q in self.subscriptions:
            q.put_nowait(d)

    async def run(self):
        db_id = await async_config_value(self.proposal, "db_id")
        update_topic = KAFKA_UPDATE_TOPIC.format(db_id)

        consumer = AIOKafkaConsumer(update_topic, bootstrap_servers=KAFKA_BROKERS)
        await consumer.start()
        try:
            async for msg in consumer:
                d = json.loads(msg.value)
                if d.get('msg_kind') != 'run_values_updated':
                    continue

                d2 = d['data']
                run_var_rows = await async_changed_values(
                    self.proposal, d2['proposal'], d2['run'], d2['values']
                )
                res = await prepare_latest_data(run_var_rows, self.proposal, self.schema)
                if res is not None:
                    self.notify(res)
        finally:
            await consumer.stop()




# Per-client cursor is deliberately omitted from the cache key so that
# concurrent subscribers coalesce into a single DB read per tick.
@alru_cache(maxsize=32, ttl=POLLING_INTERVAL)
async def poll_proposal(proposal, schema):
    model = get_model(proposal)
    table = await async_table(proposal, name="run_variables")
    if table is None:
        return None
    rows = await async_latest_rows(
        proposal,
        table=table,
        by="timestamp",
        start_at=model.timestamp,
    )
    if not rows:
        return None
    return prepare_latest_data(rows, proposal, schema)


async def prepare_latest_data(latest_rows, proposal, schema):
    latest_data = LatestData.from_list(latest_rows)
    latest_runs = create_map(
        await fetch_info(proposal, runs=list(latest_data.runs.keys())),
        key="run",
    )

    latest_variables = await async_variables(proposal)
    model = get_model(proposal)
    if model.update(latest_variables, timestamp=latest_data.timestamp):
        schema.update(model.stype)

    runs = {}
    run_timestamps = {}
    for run, variables in latest_data.runs.items():
        run_values = {
            name: {"value": data.value, "summary_type": data.summary_type}
            for name, data in variables.items()
        }
        run_values.setdefault("run", {"value": run})

        if run_info := latest_runs.get(run):
            run_values.update(wrap_values(run_info))

        runs[run] = model.resolve(**run_values)
        run_timestamps[run] = max(
            data.timestamp for data in variables.values()
        )

    if not runs:
        return None

    model.runs = sorted(set(model.runs + list(runs.keys())))
    metadata = {
        "runs": model.runs,
        "variables": model.variables,
        "timestamp": model.timestamp * 1000,  # deserialize to JS
    }
    return {
        "runs": runs,
        "run_timestamps": run_timestamps,
        "max_timestamp": max(run_timestamps.values()),
        "metadata": metadata,
    }


def filter_for_client(snapshot, since):
    # A zero cursor means the client never completed REFRESH; skip the tick
    # rather than flooding it with every row newer than epoch.
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
    @strawberry.subscription
    async def latest_data(
        self,
        info: Info,
        database: DatabaseInput,
        timestamp: Timestamp,  # FIX: # pyright: ignore[reportInvalidTypeForm]
    ) -> AsyncGenerator[JSON]:  # FIX: # pyright: ignore[reportInvalidTypeForm]
        q = await DBWatcher.queue_for_proposal(database.proposal, info.schema)

        try:
            while True:
                update = await q.get()
                yield update
        finally:
            DBWatcher.drop_queue(database.proposal, q)
