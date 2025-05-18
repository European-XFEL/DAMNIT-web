import asyncio
import logging
from pathlib import Path

import aiofiles


async def fetch_file_data(file_path: Path, with_content: bool = False):
    attempts = 3

    for _ in range(attempts):
        try:
            async with aiofiles.open(file_path, encoding="utf-8") as f:
                return await f.read()
        except OSError as e:
            logging.warning("Error reading %r, retrying… %s", file_path, e)
            await asyncio.sleep(0.1)

    return ""
