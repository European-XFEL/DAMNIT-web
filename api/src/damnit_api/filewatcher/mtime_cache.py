import os
import time
from pathlib import Path
TTL = 5.0

file_mtime_cache: dict[str, dict[str, float]] = {}


def get(file_path: str) -> float:
    print(file_mtime_cache)
    now = time.monotonic()
    entry = file_mtime_cache.get(file_path)

    if entry and now - entry["last_checked"] <= TTL:
        return entry["last_modified"]

    mtime = os.path.getmtime(file_path)
    file_mtime_cache[file_path] = {
        "last_modified": mtime,
        "last_checked": now,
    }

    for fp, e in list(file_mtime_cache.items()):
        if now - e["last_checked"] > TTL + 1:
            del file_mtime_cache[fp]

    return mtime
