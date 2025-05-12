import aiofiles
import logging
import asyncio
from pathlib import Path

async def fetch_file_data(file_path: Path, with_content=False):
    attempts = 3
    for _ in range(attempts):
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                return await f.read()
        except (OSError, IOError) as e:
            logging.warning(f"Error reading {file_path!r}, retrying… {e}")
            await asyncio.sleep(0.1)
    return ""