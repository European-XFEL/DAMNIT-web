import asyncio
import datetime
import re
from configparser import ConfigParser
from enum import Enum
from pathlib import Path
from typing import Self
from xmlrpc.client import ServerProxy

from pydantic import BaseModel, DirectoryPath

_PNFS_SUB_RE = re.compile(
    r"/pnfs/xfel\.eu/exfel/archive/XFEL/(?:proc|raw)"
    r"/(?P<inst>[^/]+)/(?P<cycle>[^/]+)/p(?P<prop>[^/]+)"
)

_GPFS_RE = re.compile(
    r"/gpfs/exfel/exp/(?P<inst>[^/]+)/(?P<cycle>[^/]+)/p(?P<prop>[^/]+)"
)

_GPFS_SUB_RE = re.compile(
    r"/gpfs/exfel/(?:u/scratch|u/usr|d/proc|d/raw)"
    r"/(?P<inst>[^/]+)/(?P<cycle>[^/]+)/p(?P<prop>[^/]+)"
)

_PATH = [_PNFS_SUB_RE, _GPFS_RE, _GPFS_SUB_RE]


class Proposal(BaseModel):
    """Instance data related to proposal/path."""

    path: Path
    no: int
    cycle: int
    instrument: str

    @classmethod
    def from_path(cls, path: str) -> Self:
        match = [m.match(str(path)) for m in _PATH]
        match = [m for m in match if m]

        if not match:
            raise Exception

        group = match[0].groupdict()

        inst, cycle, prop = group["inst"], group["cycle"], int(group["prop"])

        return cls(
            path=Path("/gpfs/exfel/exp") / inst / cycle / f"p{prop:06d}",
            no=group["prop"],  # type: ignore
            cycle=group["cycle"],  # type: ignore
            instrument=group["inst"],  # type: ignore
        )


class Metadata(BaseModel):
    """Instance data retrieved from MyMDC."""

    title: str
    description: str
    pi: str

    beamtime_start: datetime.datetime
    beamtime_end: datetime.datetime

    @classmethod
    async def from_mymdc(cls, proposal_no: int) -> Self:
        raise NotImplementedError


class ListenerStatus(Enum):
    running = "running"
    stopped = "stopped"


class Listener(BaseModel):
    """Instance data relate to DAMNIT listener."""

    path: DirectoryPath

    def _get_last_modify(self) -> datetime.datetime | None:
        try:
            db_file = self.path / "runs.sqlite"
            return datetime.datetime.fromtimestamp(db_file.stat().st_mtime)
        except FileNotFoundError:
            return None

    async def get_last_modify(self) -> datetime.datetime | None:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_last_modify)

    def _get_status(self) -> ListenerStatus | None:
        try:
            supervisor_config = self.path / "supervisord.conf"
            config = ConfigParser()
            config.read(supervisor_config)
            serverurl = config["supervisorctl"]["serverurl"]
            server = ServerProxy(serverurl)
            return ListenerStatus(server.supervisor.getState()["state"])  # type: ignore
        except (KeyError, ConnectionRefusedError):
            return None

    async def get_status(self) -> ListenerStatus | None:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_status)
