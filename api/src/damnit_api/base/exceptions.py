from pathlib import Path

from fastapi import HTTPException


class DWAError(Exception): ...


class DWAHTTPError(DWAError, HTTPException): ...


class InvalidProposalPathError(DWAError):
    def __init__(self, path: Path):
        self.path = path
        super().__init__(f"Invalid proposal path: {path}")
