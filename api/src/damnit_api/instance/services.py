from functools import lru_cache
from pathlib import Path


@lru_cache
def get_amore_dirs():
    return Path("/gpfs/exfel/exp/").glob("*/*/*/usr/Shared/amore")
