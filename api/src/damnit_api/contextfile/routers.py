import re
from pathlib import Path
from typing import Annotated

from anyio import Path as APath
from fastapi import APIRouter, Depends, HTTPException

from ..auth.dependencies import OAuthUserInfo
from ..metadata.models import ProposalMeta
from ..metadata.routers import get_proposal_meta
from ..shared.settings import settings
from . import models

router = APIRouter(prefix="/contextfile")

SLUG_PATTERN = re.compile(r"[^a-zA-Z0-9_.-]+")


@router.get("/content")
async def get_content(
    proposal: Annotated[ProposalMeta, Depends(get_proposal_meta)],
) -> models.ContextFile | None:
    if proposal.damnit_path is None:
        return None

    return await models.ContextFile.from_file(
        APath(proposal.damnit_path) / "context.py"
    )


@router.get("/last_modified")
async def get_modified(
    proposal: Annotated[ProposalMeta, Depends(get_proposal_meta)],
) -> models.ModifiedTime | None:
    if proposal.damnit_path is None:
        return None

    return await models.ModifiedTime.from_file(
        APath(proposal.damnit_path) / "context.py"
    )


@router.get("/campaign/{campaign}/me")
async def get_campaign_context(
    campaign: str,
    user: OAuthUserInfo,
) -> models.CampaignContextFile:
    """Return this user's editable context file for one HZDR campaign/source."""
    context_path = _campaign_context_path(campaign, user, "context.py")
    _ensure_context_file(context_path, campaign, user)
    return await _read_campaign_context(campaign, user, context_path)


@router.get("/campaign/{campaign}/me/files")
async def list_campaign_context_files(
    campaign: str,
    user: OAuthUserInfo,
) -> list[models.ContextFileEntry]:
    """List context variants in this user's campaign workspace."""
    workspace_path = _campaign_context_workspace(campaign, user)
    workspace_path.mkdir(parents=True, exist_ok=True)
    files = sorted(workspace_path.glob("*.py"))
    if not files:
        context_path = _campaign_context_path(campaign, user, "context.py")
        _ensure_context_file(context_path, campaign, user)
        files = [context_path]
    return [
        models.ContextFileEntry(
            name=file_path.name,
            path=str(file_path),
            active=file_path.name == "context.py",
        )
        for file_path in files
    ]


@router.get("/campaign/{campaign}/me/files/{file_name}")
async def get_campaign_context_file(
    campaign: str,
    file_name: str,
    user: OAuthUserInfo,
) -> models.CampaignContextFile:
    """Return a named context variant for this user and campaign."""
    context_path = _campaign_context_path(campaign, user, file_name)
    _ensure_context_file(context_path, campaign, user)
    return await _read_campaign_context(campaign, user, context_path)


@router.put("/campaign/{campaign}/me")
async def save_campaign_context(
    campaign: str,
    payload: models.ContextFileUpdate,
    user: OAuthUserInfo,
) -> models.CampaignContextFile:
    """Save this user's editable context file for one HZDR campaign/source."""
    if not settings.context_workspace.write_enabled:
        raise HTTPException(status_code=403, detail="Context editing is disabled")

    context_path = _campaign_context_path(campaign, user, "context.py")
    return await _write_campaign_context(campaign, payload, user, context_path)


@router.put("/campaign/{campaign}/me/files/{file_name}")
async def save_campaign_context_file(
    campaign: str,
    file_name: str,
    payload: models.ContextFileUpdate,
    user: OAuthUserInfo,
) -> models.CampaignContextFile:
    """Save a named context variant for this user and campaign."""
    if not settings.context_workspace.write_enabled:
        raise HTTPException(status_code=403, detail="Context editing is disabled")

    context_path = _campaign_context_path(campaign, user, file_name)
    return await _write_campaign_context(campaign, payload, user, context_path)


async def _write_campaign_context(
    campaign: str,
    payload: models.ContextFileUpdate,
    user: OAuthUserInfo,
    context_path,
) -> models.CampaignContextFile:
    """Write a context file and return the refreshed file model."""
    context_path.parent.mkdir(parents=True, exist_ok=True)
    context_path.write_text(payload.fileContent, encoding="utf-8")
    models.ModifiedTime.from_file.cache_clear()
    models.ContextFile.from_file.cache_clear()
    return await _read_campaign_context(campaign, user, context_path)


async def _read_campaign_context(
    campaign: str, user: OAuthUserInfo, context_path
) -> models.CampaignContextFile:
    """Read a context file and attach campaign/user/path metadata."""
    context_file = await models.ContextFile.from_file(APath(context_path))
    return models.CampaignContextFile(
        campaign=campaign,
        user=_user_slug(user),
        path=str(context_path),
        **context_file.model_dump(),
    )


def _campaign_context_workspace(campaign: str, user: OAuthUserInfo):
    """Resolve the workspace directory for one campaign/user."""
    root = settings.context_workspace.root.resolve()
    workspace_path = (root / _slug(campaign) / _user_slug(user)).resolve()
    if not workspace_path.is_relative_to(root):
        raise HTTPException(status_code=400, detail="Invalid context path")
    return workspace_path


def _campaign_context_path(campaign: str, user: OAuthUserInfo, file_name: str):
    """Resolve a campaign/user context path under the configured workspace root."""
    workspace_path = _campaign_context_workspace(campaign, user)
    safe_file_name = _context_file_name(file_name)
    resolved_path = (workspace_path / safe_file_name).resolve()
    if not resolved_path.is_relative_to(workspace_path):
        raise HTTPException(status_code=400, detail="Invalid context path")
    return resolved_path


def _context_file_name(file_name: str) -> str:
    """Create a safe Python filename for a context variant."""
    stem = _slug(Path(file_name).stem)
    return f"{stem}.py"


def _ensure_context_file(path, campaign: str, user: OAuthUserInfo) -> None:
    """Create a starter context file for a campaign/user if it does not exist."""
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_starter_context(campaign, user), encoding="utf-8")


def _slug(value: str) -> str:
    """Create a conservative filesystem slug."""
    slug = SLUG_PATTERN.sub("-", value.strip()).strip("-")
    return slug or "default"


def _user_slug(user: OAuthUserInfo) -> str:
    """Prefer stable usernames over display names for context workspace paths."""
    return _slug(user.preferred_username or user.email)


def _starter_context(campaign: str, user: OAuthUserInfo) -> str:
    """Create the starter context.py content for one HZDR user workspace."""
    return f'''"""User context for HZDR campaign/source {campaign}."""

from damnit_ctx import Skip, Variable


@Variable(title="HZDR/User context owner")
def hzdr_context_owner(run):
    """Show which user workspace produced this context."""
    return {user.preferred_username!r}


@Variable(title="HZDR/Campaign")
def hzdr_campaign(run):
    """Show the campaign/source key for this context."""
    return {campaign!r}


@Variable(title="HZDR/Next field")
def hzdr_next_field(run):
    """Replace this placeholder with a real HZDR computed field."""
    raise Skip("Edit this user campaign context to add computed fields")
'''
