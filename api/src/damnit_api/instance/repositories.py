import asyncio
from pathlib import Path
import yaml
from async_lru import alru_cache


class AmoreDirRepo:
    data: dict[str, list[str]]  # cycle paths to list of amore dirs
    on_resync: list[str]  # list of paths to glob through on resync

    @alru_cache
    async def sync_init(self):
        loop = asyncio.get_event_loop()

        cycles = await loop.run_in_executor(
            None,
            lambda: set(Path("/gpfs/exfel/exp/").glob("*/*")),
        )

        for cycle in cycles:
            self.data[str(cycle)] = await loop.run_in_executor(
                None, lambda: list(cycle.glob("*/usr/Shared/amore"))
            )

    async def write(self):
        yaml.safe_dump({""})
