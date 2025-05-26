from pathlib import Path

import aiofiles

from .. import get_logger

logger = get_logger()


async def fetch_file_data(file_path: Path, with_content: bool = False):

    try:
        async with aiofiles.open(file_path, encoding="utf-8") as f:
            return await f.read()
    except OSError as e:
        logger.warning("Error reading %r, retrying… %s", file_path, e)

    return ""
