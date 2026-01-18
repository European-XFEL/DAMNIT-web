from typing import Self

import async_lru
from anyio import Path as APath
from pydantic import BaseModel


class ModifiedTime(BaseModel):
    lastModified: float  # noqa: N815

    @classmethod
    @async_lru.alru_cache(ttl=5)
    async def from_file(cls, path: APath) -> Self:
        stat = await path.stat()
        return cls(lastModified=stat.st_mtime)


class ContextFile(BaseModel):
    lastModified: float  # noqa: N815
    fileContent: str  # noqa: N815

    @classmethod
    @async_lru.alru_cache(ttl=5)
    async def from_file(cls, path: APath) -> Self:
        content = await path.read_text()
        modified_timestamp = await ModifiedTime.from_file(path)
        return cls(lastModified=modified_timestamp.lastModified, fileContent=content)


# TODO: update models to the following and update frontend API calls:
#
# class ModifiedTime(BaseModel):
#     unix_timestamp: float
#     time: datetime

#     @classmethod
#     @async_lru.alru_cache(ttl=5)
#     async def from_file(cls, path: APath) -> Self:
#         stat = await path.stat()
#         return cls(
#             unix_timestamp=stat.st_mtime,
#             time=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
#         )


# class ContextFile(BaseModel):
#     modified_time: ModifiedTime
#     content: str

#     @classmethod
#     @async_lru.alru_cache(ttl=5)
#     async def from_file(cls, path: APath) -> Self:
#         content = await path.read_text()
#         modified_time = await ModifiedTime.from_file(path)
#         return cls(modified_time=modified_time, content=content)
