"""ASAPO spool consumer using the harness HTTP broker interface.

The local broker in ``asapo-for-hzdr-damnit/tools/local_message_suite.py``
and the drop-in production scripts expose the same HTTP API:

    GET  /api/claim?group=<g>&campaign=<c>&limit=<n>
         → { "messages": [...], "ack": { "group", "campaign", "offset" } }

    POST /api/ack
         body: { "group": <g>, "campaign": <c>, "offset": <n> }

This consumer uses ``httpx.AsyncClient`` (already a project dependency) so
the poll loop is non-blocking inside the FastAPI asyncio event loop.

Production swap: point ``broker_url`` at the real ASAPO broker endpoint and
set the ``campaign`` / ``consumer_group`` to match the deployment.  No other
code changes are needed.
"""

from __future__ import annotations

import urllib.parse
from pathlib import Path  # noqa: TC003
from typing import Any

import httpx

from .spool import HZDRSpoolConsumer, SpoolConfig


class AsapoSpoolConsumer(HZDRSpoolConsumer):
    """ASAPO/harness HTTP consumer that implements the claim/ack protocol."""

    def __init__(
        self,
        config: SpoolConfig,
        broker_url: str,
        timeout: float = 10.0,
    ) -> None:
        super().__init__(config)
        self._broker = broker_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=timeout)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _claim(self) -> tuple[list[dict[str, Any]], Any]:
        params = urllib.parse.urlencode({
            "group": self.config.consumer_group,
            "campaign": self.config.campaign or "*",
            "limit": self.config.batch_size,
        })
        url = f"{self._broker}/api/claim?{params}"
        response = await self._client.get(url)
        response.raise_for_status()
        data = response.json()
        messages: list[dict[str, Any]] = data.get("messages", [])
        token: dict[str, Any] = data.get("ack", {})
        return messages, token

    async def _ack(self, token: Any) -> None:
        if not token:
            return
        url = f"{self._broker}/api/ack"
        response = await self._client.post(url, json=token)
        response.raise_for_status()

    @classmethod
    def from_settings(cls, spool_root: Path) -> AsapoSpoolConsumer:
        """Build from the DW_API_HZDR_SPOOL__* settings block."""
        from ..shared.settings import settings

        raw_dir = settings.hzdr_spool.spool_dir
        spool_dir = raw_dir if raw_dir.is_absolute() else spool_root / raw_dir
        cfg = SpoolConfig(
            campaign=settings.hzdr_spool.campaign,
            consumer_group=settings.hzdr_spool.consumer_group,
            spool_dir=spool_dir,
            poll_interval=settings.hzdr_spool.poll_interval,
            batch_size=settings.hzdr_spool.batch_size,
        )
        broker_url = settings.hzdr_spool.broker_url
        # The model validator on HZDRSpoolSettings already rejects enabled=True
        # without a broker_url, so this guard is only reached in a valid config.
        if broker_url is None:
            msg = "broker_url required (validated by HZDRSpoolSettings)"
            raise RuntimeError(msg)
        return cls(config=cfg, broker_url=broker_url)
