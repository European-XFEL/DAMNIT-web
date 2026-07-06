"""Lifespan wiring for the HZDR durable spool consumers + builder auto-trigger.

Extracted verbatim from ``main.py`` so the fork's diff against upstream
``main.py`` shrinks to a single ``async with`` hook.  This is entirely fork-only
machinery — upstream has no spool consumers — so keeping the startup/shutdown
here means an upstream PR that touches ``main.py`` never has to carry (or review)
the spool/trigger wiring.

``spool_lifespan`` starts whichever consumers are enabled (ASAPO, Kafka), wires
the optional debounced :class:`~.builder_trigger.BuilderTrigger` to each, yields
while they run in background tasks, then stops and closes them on exit.  When
nothing is enabled it is a no-op context manager.  The heavy transport imports
(ASAPO SDK, confluent-kafka) stay lazy inside the conditionals so an unused
transport never has to be installed.
"""

from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from ..shared.settings import Settings


@asynccontextmanager
async def spool_lifespan(settings: Settings, logger: Any) -> AsyncIterator[None]:
    """Run the enabled spool consumers + builder trigger for the app's lifetime.

    Mirrors the previous inline ``main.py`` block one-for-one: same enable gates,
    same structured log calls, same shutdown order (stop event → cancel tasks →
    await → ``aclose``).  The cleanup runs in a ``finally`` so an exception while
    the app is serving cannot leak the background tasks or consumer resources.
    """
    spool_root = settings.damnit_path or Path.cwd()
    spool_stop = asyncio.Event()
    spool_consumers = []
    spool_tasks = []
    # ASAPO spool writes events.jsonl (--events-jsonl); Kafka spool writes
    # trigger.jsonl (--trigger-jsonl).  Collected here so the optional builder
    # auto-trigger reruns the builder against exactly the running spool files.
    builder_events_jsonl = []
    builder_trigger_jsonl = []
    if settings.hzdr_spool.enabled:
        from .asapo import AsapoSpoolConsumer

        asapo_consumer = AsapoSpoolConsumer.from_settings(spool_root)
        spool_consumers.append(asapo_consumer)
        builder_events_jsonl.append(asapo_consumer.config.events_jsonl)
        spool_tasks.append(asyncio.create_task(asapo_consumer.run(spool_stop)))
        logger.info(
            "ASAPO spool consumer started",
            campaign=settings.hzdr_spool.campaign,
            broker_kind=settings.hzdr_spool.broker_kind,
            broker=(
                settings.hzdr_spool.broker_url
                if settings.hzdr_spool.broker_kind == "http"
                else settings.hzdr_spool.asapo_endpoint
            ),
        )
    if settings.hzdr_kafka_spool.enabled:
        from .kafka import KafkaSpoolConsumer

        kafka_consumer = KafkaSpoolConsumer.from_settings(spool_root)
        spool_consumers.append(kafka_consumer)
        builder_trigger_jsonl.append(kafka_consumer.config.events_jsonl)
        spool_tasks.append(asyncio.create_task(kafka_consumer.run(spool_stop)))
        logger.info(
            "Kafka spool consumer started",
            campaign=settings.hzdr_kafka_spool.campaign,
            bootstrap_servers=settings.hzdr_kafka_spool.bootstrap_servers,
            topics=settings.hzdr_kafka_spool.topics,
        )

    if settings.hzdr_builder.enabled and spool_consumers:
        from .builder_trigger import BuilderTrigger

        builder_trigger = BuilderTrigger(
            settings.hzdr_builder,
            events_jsonl=builder_events_jsonl,
            trigger_jsonl=builder_trigger_jsonl,
        )
        for consumer in spool_consumers:
            consumer.on_new_events_hook = builder_trigger.notify
        spool_tasks.append(asyncio.create_task(builder_trigger.run(spool_stop)))
        logger.info(
            "Builder auto-trigger started",
            output_nexus=str(settings.hzdr_builder.output_nexus),
            debounce_seconds=settings.hzdr_builder.debounce_seconds,
        )
    elif settings.hzdr_builder.enabled:
        logger.warning(
            "DW_API_HZDR_BUILDER__ENABLED=true but no spool consumer is "
            "enabled; nothing will trigger the builder"
        )

    try:
        yield
    finally:
        if spool_tasks:
            spool_stop.set()
            for task in spool_tasks:
                task.cancel()
            for task in spool_tasks:
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
        for consumer in spool_consumers:
            await consumer.aclose()
