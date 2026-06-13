import inspect
import re
import sys
import types
from contextlib import suppress
from pathlib import Path

from anyio import Path as APath
from fastapi import APIRouter, HTTPException

from ..auth.dependencies import OAuthUserInfo
from ..metadata.hzdr_sources import HZDRShot, HZDRSourceProvider
from ..shared.settings import settings
from . import models

router = APIRouter(prefix="/contextfile")

SLUG_PATTERN = re.compile(r"[^a-zA-Z0-9_.-]+")


async def get_proposal_info(proposal_num: str):  # noqa: RUF029
    """Compatibility hook for legacy context-file proposal lookups."""
    return {
        "damnit_path": settings.damnit.path_for(proposal_num),
    }


@router.get("/content")
async def get_content(
    proposal_num: str,
) -> models.ContextFile | None:
    proposal_info = await get_proposal_info(proposal_num)
    damnit_path = proposal_info.get("damnit_path")
    if damnit_path is None:
        return None

    return await models.ContextFile.from_file(APath(damnit_path) / "context.py")


@router.get("/last_modified")
async def get_modified(
    proposal_num: str,
) -> models.ModifiedTime | None:
    proposal_info = await get_proposal_info(proposal_num)
    damnit_path = proposal_info.get("damnit_path")
    if damnit_path is None:
        return None

    models.ModifiedTime.from_file.cache_clear()
    return await models.ModifiedTime.from_file(APath(damnit_path) / "context.py")


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


@router.get("/campaign/{campaign}/me/results")
async def get_campaign_context_results(
    campaign: str,
    user: OAuthUserInfo,
) -> dict:
    """Run this user's active context file against HZDR source shots."""
    context_path = _campaign_context_path(campaign, user, "context.py")
    _ensure_context_file(context_path, campaign, user)
    source = HZDRSourceProvider(settings.metadata).get_source(campaign)
    if source is None:
        raise HTTPException(status_code=404, detail="Unknown HZDR source")
    return _run_hzdr_context_file(context_path, source.shots)


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


@Variable(title="HZDR/Laser energy J")
def hzdr_laser_energy_j(run, laser_energy_j=None):
    """Show the emulated laser energy metadata for this shot."""
    if laser_energy_j is None:
        raise Skip("No laser_energy_j metadata for this shot")
    return laser_energy_j


@Variable(title="HZDR/Computed field")
def hzdr_computed_field(run, laser_energy_j=None, chamber_pressure_mbar=None):
    """Small starter calculation that behaves like a real table column."""
    if laser_energy_j is None or chamber_pressure_mbar is None:
        raise Skip("Missing laser energy or chamber pressure metadata")
    return round(float(laser_energy_j) * float(chamber_pressure_mbar) * 1_000_000, 4)
'''


class ContextSkip(Exception):  # noqa: N818
    """Local stand-in for DAMNIT Skip during HZDR context previews."""


class ContextCell:
    """Local stand-in for DAMNIT Cell values during HZDR context previews."""

    def __init__(self, value, summary=None, preview=None):
        self.value = value
        self.summary = summary
        self.preview = preview


def _run_hzdr_context_file(context_path: Path, shots: list[HZDRShot]) -> dict:
    """Execute context variables and return shot-indexed table values."""
    variables = _load_context_variables(context_path, shots)
    rows = []
    for shot in shots:
        values = {}
        errors = {}
        previews = {}
        for name, variable in variables.items():
            try:
                raw_value = _call_context_variable(variable, shot)
                values[name] = _json_safe(_summarize_context_value(raw_value))
                preview = _summarize_context_preview(raw_value)
                if preview is not None:
                    previews[name] = _json_safe(preview)
            except ContextSkip as exc:
                values[name] = None
                errors[name] = str(exc)
            except Exception as exc:
                values[name] = None
                errors[name] = f"{type(exc).__name__}: {exc}"
        rows.append({
            "shot_number": shot.shot_number,
            "values": values,
            "errors": errors,
            "previews": previews,
        })
    return {
        "columns": [
            {
                "name": name,
                "title": getattr(variable, "_damnit_title", name),
            }
            for name, variable in variables.items()
        ],
        "rows": rows,
    }


def _load_context_variables(context_path: Path, shots: list[HZDRShot]):
    """Load @Variable functions from a user context file."""
    module = types.ModuleType("damnit_ctx")

    def variable_decorator(*decorator_args, **decorator_kwargs):
        def decorate(function):
            function._damnit_variable = True
            function._damnit_title = decorator_kwargs.get("title", function.__name__)
            return function

        if decorator_args and callable(decorator_args[0]):
            return decorate(decorator_args[0])
        return decorate

    module.Variable = variable_decorator
    module.Skip = ContextSkip
    module.Cell = ContextCell
    module.mongo_find_one = lambda collection, query=None: _mongo_find_one(
        shots, query or {}
    )
    previous_module = sys.modules.get("damnit_ctx")
    sys.modules["damnit_ctx"] = module
    namespace = {
        "__name__": "hzdr_user_context",
        "__file__": str(context_path),
        "Cell": ContextCell,
        "Skip": ContextSkip,
        "Variable": variable_decorator,
        "mongo_find_one": module.mongo_find_one,
    }
    _add_common_context_globals(namespace)
    try:
        exec(  # noqa: S102 - context previews intentionally execute user code.
            compile(
                context_path.read_text(encoding="utf-8"),
                str(context_path),
                "exec",
            ),
            namespace,
        )
    finally:
        if previous_module is None:
            sys.modules.pop("damnit_ctx", None)
        else:
            sys.modules["damnit_ctx"] = previous_module
    return {
        name: value
        for name, value in namespace.items()
        if callable(value) and getattr(value, "_damnit_variable", False)
    }


def _add_common_context_globals(namespace: dict) -> None:
    """Provide forgiving globals for context files with accidentally removed imports."""
    with suppress(ImportError):
        import h5py

        namespace["h5py"] = h5py

    with suppress(ImportError):
        import numpy as np

        namespace["np"] = np

    with suppress(ImportError):
        import plotly.express as px

        namespace["px"] = px


def _call_context_variable(variable, shot: HZDRShot):
    kwargs = {}
    for name, parameter in inspect.signature(variable).parameters.items():
        if name == "run":
            kwargs[name] = shot.shot_number
            continue
        annotation = parameter.annotation
        if annotation == "meta#hdf5_path" or name == "hdf5_path":
            kwargs[name] = str(shot.hdf5_path) if shot.hdf5_path else ""
        elif annotation == "meta#shot_number" or name == "shot_number":
            kwargs[name] = shot.shot_number
        elif annotation == "meta#shot_id" or name == "shot_id":
            kwargs[name] = (
                shot.metadata.get("shot_id") or f"shot-{shot.shot_number:06d}"
            )
        else:
            kwargs[name] = shot.metadata.get(name)
    return variable(**kwargs)


def _mongo_find_one(shots: list[HZDRShot], query: dict):
    """Use loaded shot metadata as a local Mongo stand-in for previews."""
    requested_shot = query.get("shot_number") or query.get("shot")
    for shot in shots:
        if requested_shot is not None and int(requested_shot) != shot.shot_number:
            continue
        return {
            "shot_number": shot.shot_number,
            "fired_at": shot.fired_at,
            "hdf5_path": str(shot.hdf5_path) if shot.hdf5_path else None,
            **shot.metadata,
        }
    return None


def _summarize_context_value(value):
    if isinstance(value, ContextCell):
        if value.summary == "mean":
            return _array_mean(value.value)
        if value.summary == "nanmean":
            return _array_nanmean(value.value)
        return value.summary if value.summary is not None else value.value
    return value


def _summarize_context_preview(value):
    if not isinstance(value, ContextCell):
        return None
    preview = value.preview
    if hasattr(preview, "to_json"):
        return {"kind": "plotly", "json": preview.to_json()}
    return preview


def _array_mean(value):
    import numpy as np

    return float(np.mean(value))


def _array_nanmean(value):
    import numpy as np

    return float(np.nanmean(value))


def _json_safe(value):
    import numpy as np

    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, Path):
        return str(value)
    return value
