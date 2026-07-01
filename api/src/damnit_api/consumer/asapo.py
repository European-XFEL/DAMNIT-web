"""ASAPO spool consumers.

The local broker in ``asapo-for-hzdr-damnit/tools/local_message_suite.py``
exposes a small HTTP API:

    GET  /api/claim?group=<g>&campaign=<c>&limit=<n>
         → { "messages": [...], "ack": { "group", "campaign", "offset" } }

    POST /api/ack
         body: { "group": <g>, "campaign": <c>, "offset": <n> }

Real ASAPO uses the optional DESY ``asapo_consumer`` SDK.  Both transports feed
the same ``HZDRSpoolConsumer`` claim/write-fsync/ack loop.
"""

from __future__ import annotations

import asyncio
import json
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
    def from_settings(cls, spool_root: Path) -> HZDRSpoolConsumer:
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
        if settings.hzdr_spool.broker_kind == "asapo":
            return RealAsapoSpoolConsumer(
                config=cfg,
                endpoint=settings.hzdr_spool.asapo_endpoint,
                beamtime=settings.hzdr_spool.asapo_beamtime,
                data_source=settings.hzdr_spool.asapo_data_source,
                token=settings.hzdr_spool.asapo_token.get_secret_value(),
                stream=settings.hzdr_spool.asapo_stream,
                source_path=settings.hzdr_spool.asapo_source_path,
                has_filesystem=settings.hzdr_spool.asapo_has_filesystem,
                timeout_ms=settings.hzdr_spool.asapo_timeout_ms,
            )
        broker_url = settings.hzdr_spool.broker_url
        # The model validator on HZDRSpoolSettings already rejects enabled=True
        # without a broker_url, so this guard is only reached in a valid config.
        if broker_url is None:
            msg = "broker_url required (validated by HZDRSpoolSettings)"
            raise RuntimeError(msg)
        return cls(config=cfg, broker_url=broker_url)


class RealAsapoSpoolConsumer(HZDRSpoolConsumer):
    """Real ASAPO SDK consumer with ack-after-fsync semantics."""

    def __init__(
        self,
        config: SpoolConfig,
        endpoint: str,
        beamtime: str,
        data_source: str,
        token: str,
        stream: str = "default",
        source_path: str = "auto",
        has_filesystem: bool = False,
        timeout_ms: int = 5000,
        sdk_consumer: Any | None = None,
        sdk_module: Any | None = None,
    ) -> None:
        super().__init__(config)
        self._stream = stream
        self._sdk_module = sdk_module
        if sdk_consumer is not None:
            self._consumer = sdk_consumer
            return
        sdk = self._import_sdk()
        self._consumer = sdk.create_consumer(
            endpoint,
            source_path,
            has_filesystem,
            beamtime,
            data_source,
            token,
            timeout_ms,
        )

    async def aclose(self) -> None:
        return None

    async def _claim(self) -> tuple[list[dict[str, Any]], Any]:
        return await asyncio.to_thread(self._claim_sync)

    async def _ack(self, token: Any) -> None:
        await asyncio.to_thread(self._ack_sync, token)

    def _claim_sync(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        messages: list[dict[str, Any]] = []
        ack_tokens: list[dict[str, Any]] = []
        for _ in range(self.config.batch_size):
            try:
                data, meta = self._consumer.get_next(
                    self.config.consumer_group,
                    stream=self._stream,
                    meta_only=False,
                    ordered=True,
                )
            except self._end_of_stream_errors():
                break
            message = self._decode_message(data, meta)
            messages.append(message)
            ack_tokens.append({"message_id": meta["_id"], "stream": self._stream})
        return messages, ack_tokens

    def _ack_sync(self, token: Any) -> None:
        if not token:
            return
        for item in token:
            self._consumer.acknowledge(
                self.config.consumer_group,
                item["message_id"],
                stream=item["stream"],
            )

    def _decode_message(self, data: Any, meta: dict[str, Any]) -> dict[str, Any]:
        if hasattr(data, "tobytes"):
            raw = data.tobytes()
        elif isinstance(data, bytes):
            raw = data
        else:
            raw = bytes(data)
        message = json.loads(raw.decode("utf-8"))
        if not isinstance(message, dict):
            msg = "ASAPO message payload must decode to a JSON object"
            raise ValueError(msg)
        payload_ref = message.setdefault("payload_ref", {})
        if isinstance(payload_ref, dict):
            payload_ref.setdefault("asapo_message_id", meta.get("_id"))
            payload_ref.setdefault("path", meta.get("name"))
            payload_ref.setdefault("stream", self._stream)
        return message

    def _end_of_stream_errors(self) -> tuple[type[BaseException], ...]:
        sdk = self._sdk_module or self._import_sdk()
        return (
            sdk.AsapoEndOfStreamError,
            sdk.AsapoStreamFinishedError,
        )

    def _import_sdk(self) -> Any:
        if self._sdk_module is not None:
            return self._sdk_module
        try:
            import asapo_consumer  # type: ignore[import-not-found]
        except ImportError as exc:
            msg = (
                "asapo_consumer is required when "
                "DW_API_HZDR_SPOOL__BROKER_KIND=asapo. "
                "Install the damnit-api[asapo] extra in a Python version "
                "supported by the DESY ASAPO wheel."
            )
            raise RuntimeError(msg) from exc
        self._sdk_module = asapo_consumer
        return asapo_consumer
