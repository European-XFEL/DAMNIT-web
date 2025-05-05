import hashlib
import os
import logging
import asyncio
from pathlib import Path

async def fetch_file_data(file_path: Path, with_content=False):
    attempts = 3
    data = {"checksum": None, "fileContent": None, "lastModified": None}
    for _ in range(attempts):
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
            return content

        except (OSError, IOError) as e:
            logging.warning(f"Error reading file {file_path}, retrying... {e}")
            await asyncio.sleep(0.1)
    return ""