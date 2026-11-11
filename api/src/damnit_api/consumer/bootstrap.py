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
    from .spool import SpoolConfig


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
    # The builder auto-trigger reruns the builder against exactly the running
    # consumers' spool files (see builder_inputs).
    asapo_config: SpoolConfig | None = None
    kafka_config: SpoolConfig | None = None
    if settings.hzdr_spool.enabled:
        from .asapo import AsapoSpoolConsumer

        asapo_consumer = AsapoSpoolConsumer.from_settings(spool_root)
        spool_consumers.append(asapo_consumer)
        asapo_config = asapo_consumer.config
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
        kafka_config = kafka_consumer.config
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
            settings.hzdr_builder, **builder_inputs(asapo_config, kafka_config)
        )
        for consumer in spool_consumers:
            consumer.on_new_events_hook = builder_trigger.notify
        spool_tasks.append(asyncio.create_task(builder_trigger.run(spool_stop)))
        _log_builder_started(settings, logger)
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


def builder_inputs(
    asapo_config: SpoolConfig | None, kafka_config: SpoolConfig | None
) -> dict[str, list[Any]]:
    """The spool files a :class:`BuilderTrigger` reads, from the consumers' configs.

    The ASAPO spool writes ``events.jsonl`` (``--events-jsonl``), the Kafka spool
    ``trigger.jsonl`` (``--trigger-jsonl``); each also has a shared
    ``_unassigned`` file (decision D1) that every campaign's build reads, and
    the multi-campaign builder takes each spool's root and file name.
    """
    inputs: dict[str, list[Any]] = {
        "events_jsonl": [],
        "trigger_jsonl": [],
        "unassigned_events_jsonl": [],
        "unassigned_trigger_jsonl": [],
        "events_spools": [],
        "trigger_spools": [],
    }
    for config, kind in ((asapo_config, "events"), (kafka_config, "trigger")):
        if config is None:
            continue
        inputs[f"{kind}_jsonl"].append(config.events_jsonl)
        inputs[f"unassigned_{kind}_jsonl"].append(config.unassigned_jsonl)
        inputs[f"{kind}_spools"].append((config.spool_dir, config.filename))
    return inputs


def builder_command(settings: Settings) -> list[str] | None:
    """The builder command line the auto-trigger would run, or None when it is off.

    Used to rebuild by hand with exactly the trigger's inputs. It reads the
    spool layout from settings and never builds a consumer, so it does not
    join the running API's Kafka consumer group.
    """
    if not settings.hzdr_builder.enabled:
        return None
    spool_root = settings.damnit_path or Path.cwd()
    asapo_config = kafka_config = None
    if settings.hzdr_spool.enabled:
        from .asapo import AsapoSpoolConsumer

        asapo_config = AsapoSpoolConsumer.config_from_settings(spool_root)
    if settings.hzdr_kafka_spool.enabled:
        from .kafka import KafkaSpoolConsumer

        kafka_config = KafkaSpoolConsumer.config_from_settings(spool_root)
    if asapo_config is None and kafka_config is None:
        return None
    from .builder_trigger import BuilderTrigger

    trigger = BuilderTrigger(
        settings.hzdr_builder, **builder_inputs(asapo_config, kafka_config)
    )
    return trigger.build_command()


def _log_builder_started(settings: Settings, logger: Any) -> None:
    builder = settings.hzdr_builder
    if not builder.multi_campaign:
        logger.info(
            "Builder auto-trigger started",
            output_nexus=str(builder.output_nexus),
            debounce_seconds=builder.debounce_seconds,
        )
        return
    logger.info(
        "Builder auto-trigger started",
        output_root=str(builder.output_root),
        sources_file=str(builder.catalog_file),
        campaigns=builder.campaigns,
        debounce_seconds=builder.debounce_seconds,
    )
    _warn_if_catalog_not_served(settings, logger)


def _warn_if_catalog_not_served(settings: Settings, logger: Any) -> None:
    """The shared catalog only reaches the UI if the API reads that same file.

    It is also where Review matches records rulings, so a mismatch means the
    builds never see them.
    """
    built = settings.hzdr_builder.catalog_file
    served = settings.metadata.sources_file
    if built is None:
        return
    if (
        settings.metadata.provider == "local"
        and served is not None
        and served.resolve() == built.resolve()
    ):
        return
    logger.warning(
        "The multi-campaign builder writes a catalog the API does not serve; "
        "set DW_API_METADATA__PROVIDER=local and "
        "DW_API_METADATA__SOURCES_FILE to it",
        built=str(built),
        served=str(served),
    )
