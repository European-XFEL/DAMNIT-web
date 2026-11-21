"""HZDR source metadata providers for file and MongoDB backed tests."""

import threading
import time
from datetime import UTC, datetime, tzinfo
from operator import itemgetter
from pathlib import Path
from typing import Any

import orjson
from pydantic import BaseModel, Field, JsonValue, computed_field

from ..shared.hzdr_paths import map_path, parse_path_map
from ..shared.settings import MetadataSettings
from .hzdr_event import HZDRPayloadRef


class HZDRSource(BaseModel):
    key: str
    title: str
    damnit_path: Path
    data_paths: list[Path] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    shots: list["HZDRShot"] = Field(default_factory=list)
    review_events: list["HZDRReviewEvent"] = Field(default_factory=list)
    match_summary: "HZDRMatchSummary" = Field(
        default_factory=lambda: HZDRMatchSummary()
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def staged_event_count(self) -> int:
        """Count staged source events this catalog actually reflects.

        Every shot also carries its own synthetic LabFrog event (see
        hzdr_nexus._labfrog_source_event); that one is not a staged JSONL
        event, so it is excluded here. This is a Flow Monitor status number,
        derived from already-loaded catalog data - not a new file scan, and
        not staging/matching logic the frontend would otherwise have to own.
        """
        matched_events = sum(
            1
            for shot in self.shots
            for event in shot.events
            if event.source != "LabFrog"
        )
        return matched_events + len(self.review_events)


class HZDRSourceSummary(BaseModel):
    """One campaign as Home lists it: counts only, no shots or events.

    Home polls every few seconds; the full source list carries every shot of
    every campaign, so this is the light shape it reads instead
    (``GET /metadata/hzdr/source-summaries``). ``waiting`` counts what Review
    matches shows as open: ambiguous events, unacknowledged unmatched events
    and shots whose campaign is still ``unassigned``.
    """

    key: str
    title: str
    damnit_path: Path
    # The catalog's metadata.experiment_id (Review matches suggests it).
    experiment_id: str | None = None
    shot_count: int = 0
    # The highest shot number in the campaign (Flow monitor's next shot).
    latest_shot_number: int | None = None
    # The latest shot's fired_at, exactly as the catalog records it.
    last_shot_at: str | None = None
    # Shots fired at or after the request's ``since`` (0 without one).
    fired_since: int = 0
    waiting: int = 0
    needs_review: int = 0
    needs_revision: int = 0
    # Shots whose fired_at is set but is no ISO-8601 time; they are left out
    # of last_shot_at and fired_since, and counted here so bad data shows.
    unreadable_times: int = 0


def _shot_time(value: str, default_tz: tzinfo) -> datetime | None:
    """A shot's fired_at as an aware datetime; a naive one takes ``default_tz``."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=default_tz)


def _open_review_event_count(source: HZDRSource) -> int:
    """Ambiguous events plus unmatched ones nobody has acknowledged."""
    return sum(
        1
        for event in source.review_events
        if event.match_status == "ambiguous"
        or (event.match_status == "unmatched" and not event.acknowledged)
    )


def summarize_source(
    source: HZDRSource,
    since: datetime | None = None,
    ruled_shot_numbers: set[int] | frozenset[int] = frozenset(),
) -> HZDRSourceSummary:
    """Count one campaign's shots and open review items for Home.

    An ``unassigned`` shot with a pending experiment ruling
    (``ruled_shot_numbers``) is not waiting, as on Review matches.

    A naive ``since`` is read as UTC. A naive ``fired_at`` is read in the zone
    of ``since`` (the browser sends its local midnight with its offset), so it
    counts the way the browser would read the same string.
    """
    if since is not None and since.tzinfo is None:
        since = since.replace(tzinfo=UTC)
    default_tz: tzinfo = UTC
    if since is not None and since.tzinfo is not None:
        default_tz = since.tzinfo
    times = [(_shot_time(shot.fired_at, default_tz), shot) for shot in source.shots]
    timed = [(fired, shot) for fired, shot in times if fired is not None]
    latest = max(timed, key=itemgetter(0), default=None)
    statuses = [shot.metadata.get("status") for shot in source.shots]
    unassigned = sum(
        1
        for shot in source.shots
        if shot.experiment_id_source == "unassigned"
        and shot.shot_number not in ruled_shot_numbers
    )
    open_events = _open_review_event_count(source)
    return HZDRSourceSummary(
        key=source.key,
        title=source.title,
        damnit_path=source.damnit_path,
        experiment_id=(
            experiment_id
            if isinstance(experiment_id := source.metadata.get("experiment_id"), str)
            else None
        ),
        shot_count=len(source.shots),
        latest_shot_number=max(
            (shot.shot_number for shot in source.shots), default=None
        ),
        last_shot_at=None if latest is None else latest[1].fired_at,
        fired_since=sum(
            1 for fired, _ in timed if since is not None and fired >= since
        ),
        waiting=open_events + unassigned,
        needs_review=statuses.count("needs-review"),
        needs_revision=statuses.count("revision-needed"),
        unreadable_times=sum(
            1 for fired, shot in times if fired is None and shot.fired_at.strip()
        ),
    )


class HZDRMatchSummary(BaseModel):
    """Matched/ambiguous/unmatched counts for one source, per the go-live gate.

    confirmed/dismissed are operator-review outcomes layered on top: confirmed
    counts events an operator attached on the Review matches page (folded into
    "matched" too, since the shot really is matched now); dismissed counts
    acknowledged-without-a-shot unmatched events (excluded from "unmatched").
    Both reset to 0 on the next catalog rebuild - see
    routers.confirm_local_review_event's docstring.
    """

    matched: int = 0
    ambiguous: int = 0
    unmatched: int = 0
    confirmed: int = 0
    dismissed: int = 0


class HZDRReviewEvent(BaseModel):
    """One ambiguous or unmatched event awaiting operator review.

    Unlike HZDRSourceEvent (an event already attached to a shot), this carries
    match_status and, for ambiguous events, the candidate_shot_keys the matcher
    actually considered tied - the set a reviewer is offered to confirm against.

    This is a reconciliation-facing API shape, not the canonical HZDREventV1
    envelope itself (it adds match_status/candidate_shot_keys/acknowledged*
    and omits shot_id, which does not apply before a shot match exists) - but
    retains the trigger's shot_number as a review clue. payload_ref reuses
    HZDRPayloadRef so source traceability stays one type across both models.
    """

    event_id: str
    experiment_id: str
    shot_number: int | None = None
    source: str
    kind: str
    timestamp: str
    transport: str | None = None
    payload_ref: HZDRPayloadRef = Field(default_factory=HZDRPayloadRef)
    metadata: dict[str, JsonValue] = Field(default_factory=dict)
    match_status: str
    match_quality: str | None = None
    candidate_shot_keys: list[str] = Field(default_factory=list)
    acknowledged: bool = False
    acknowledged_at: str | None = None
    acknowledged_by: str | None = None
    acknowledged_note: str | None = None
    review_level: str | None = None


class HZDRSourceEvent(BaseModel):
    """One source event already attached to a shot, as exposed by the API.

    A reconciliation-facing projection of HZDREventV1 - experiment_id/shot_id/
    shot_number are dropped because they are redundant with the parent
    HZDRShot, and match_quality/match_time_delta_s are added since they only
    make sense once an event has been matched - but payload_ref reuses
    HZDRPayloadRef so source traceability stays one type across both models.
    """

    event_id: str
    source: str
    kind: str
    timestamp: str
    transport: str | None = None
    payload_ref: HZDRPayloadRef = Field(default_factory=HZDRPayloadRef)
    metadata: dict[str, JsonValue] = Field(default_factory=dict)
    match_quality: str | None = None
    match_time_delta_s: float | None = None
    review_level: str | None = None


class HZDRWikiInfo(BaseModel):
    """MediaWiki link and metadata for one campaign source.

    page_url and page_title are derived from metadata.wiki_page_title or
    experiment_id + the configured DW_API_HZDR_WIKI__BASE_URL (optionally
    prefixed with DW_API_HZDR_WIKI__NAMESPACE); page_url is null when the base
    URL is not set.
    exists/last_modified/page_id/categories are only populated when the caller
    requests a live fetch from the MediaWiki Action API (fetch=true on the
    endpoint); on a fetch failure they remain null rather than raising an error.
    """

    source_key: str
    experiment_id: str | None = None
    page_title: str | None = None
    page_url: str | None = None
    configured: bool
    exists: bool | None = None
    last_modified: str | None = None
    page_id: int | None = None
    categories: list[str] = Field(default_factory=list)


class HZDRScicatInfo(BaseModel):
    """SciCat dataset link for one campaign source.

    ``configured`` reflects whether DW_API_HZDR_SCICAT__ENABLED is set;
    ``registered`` is true once the builder's post-step has stored a ``pid`` in
    the catalog.  ``dataset_url`` is present only when a public SciCat frontend
    URL is configured (DW_API_HZDR_SCICAT__FRONTEND_URL).
    """

    source_key: str
    experiment_id: str | None = None
    configured: bool
    registered: bool
    pid: str | None = None
    dataset_url: str | None = None
    version_hash: str | None = None
    registered_at: str | None = None


class HZDRDataProduct(BaseModel):
    product_id: str | None = None
    source: str
    kind: str
    path: str | None = None
    dataset_name: str | None = None
    preview_kind: str | None = None
    shape: list[int | str] = Field(default_factory=list)
    dtype: str | None = None
    units: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    # Set only in a shot detail: whether ``path`` exists on this host after the
    # path map. None when there is nothing local to check (no path, a URI).
    reachable: bool | None = None


class HZDRShot(BaseModel):
    source_key: str
    shot_number: int
    fired_at: str
    shot_key: str | None = None
    shot_date: str | None = None
    labfrog_record_id: str | None = None
    labfrog_date_time: str | None = None
    # The experimenters' Count from LabFrog's local-counter reset (bridge v5,
    # /entry/shots/labfrog_local_count). A user aid, not an identifier: the
    # governed number is ``shot_number``. None where LabFrog has no count.
    labfrog_local_count: int | None = None
    match_status: str | None = None
    match_quality: str | None = None
    match_time_delta_s: float | None = None
    # Why the shot is in this campaign (bridge v4, /entry/shots/
    # experiment_id_source): labfrog / schedule / ruling / producer /
    # unassigned. "unassigned" shots wait for a reviewer's ruling.
    experiment_id_source: str | None = None
    hdf5_path: Path | None = None
    nexus_entry: str = "/entry"
    metadata: dict[str, Any] = Field(default_factory=dict)
    events: list[HZDRSourceEvent] = Field(default_factory=list)
    data_products: list[HZDRDataProduct] = Field(default_factory=list)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def target_wiki_ref(self) -> str | None:
        """Resolved MediaWiki URL/id for the selected target, if captured."""
        return _target_string_field(self.metadata, "wiki_ref")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def target_wiki_page(self) -> str | None:
        """MediaWiki page title for the selected target, if captured."""
        return _target_string_field(self.metadata, "wiki_page")


def _optional_count(value: Any) -> int | None:
    """A whole-number count, or None; a bool or a negative sentinel is not one."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _target_string_field(metadata: dict[str, Any], field: str) -> str | None:
    target = metadata.get("target")
    if not isinstance(target, dict):
        return None
    value = target.get(field)
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


class HZDRHDF5Dataset(BaseModel):
    name: str
    shape: list[int | str]
    dtype: str


class HZDRShotDetail(BaseModel):
    shot: HZDRShot
    hdf5_exists: bool = False
    hdf5_datasets: list[HZDRHDF5Dataset] = Field(default_factory=list)
    hdf5_error: str | None = None
    # The shot's container as the campaign file links it
    # (a root entry named `<YYYYMMDD>_<number>`); its datasets are listed in
    # `hdf5_datasets` under that prefix and preview through the same file.
    container: str | None = None


class HZDRDatasetPreview(BaseModel):
    name: str
    dtype: str
    shape: list[int]
    preview: list | float | int | None = None
    preview_kind: str
    #: What a summarizing context column shows in the table: the value of a
    #: scalar, the mean of a lineout or image (``None`` when not numeric).
    summary: float | None = None
    #: False when ``summary`` comes from the strided preview, not every value.
    summary_exact: bool = True


#: Lineout points a preview sends; longer lineouts are thinned evenly.
PREVIEW_LINE_POINTS = 512
#: Up to this many bytes a lineout is read whole, so its mean is exact.
PREVIEW_LINE_READ_WHOLE_BYTES = 8 * 1024 * 1024
#: Image previews are at most this many values a side.
PREVIEW_IMAGE_SIDE = 64


def _finite_mean(values) -> float | None:
    """What a ``np.nanmean`` column shows, or None when that is not a number.

    NaN is skipped as the column skips it; an infinity makes the column's
    mean infinite, which JSON cannot carry, so there is no summary then.
    """
    import numpy as np

    try:
        data = np.asarray(values, dtype=float)
    except (TypeError, ValueError):
        return None
    if data.size == 0 or np.isnan(data).all():
        return None
    mean = float(np.nanmean(data))
    return mean if np.isfinite(mean) else None


def _plain_number_dtype(dtype) -> bool:
    """A dtype a preview can summarize: one number, no fields, no subarray."""
    return dtype.fields is None and dtype.subdtype is None and dtype.kind in "biuf"


class HZDRSourceProvider:
    """Load HZDR source metadata from the configured local provider."""

    def __init__(self, settings: MetadataSettings):
        self.settings = settings
        self._path_rules = parse_path_map(settings.path_map)

    def local_hdf5_path(self, shot: HZDRShot) -> Path | None:
        """The shot's HDF5 path as this host can open it (see hzdr_paths)."""
        return map_path(
            None if shot.hdf5_path is None else str(shot.hdf5_path),
            self._path_rules,
        )

    def with_local_paths(self, shot: HZDRShot) -> HZDRShot:
        """A copy of ``shot`` whose ``hdf5_path`` is the one this host opens."""
        return shot.model_copy(update={"hdf5_path": self.local_hdf5_path(shot)})

    def list_sources(self) -> list[HZDRSource]:
        """List available HZDR sources from local files or MongoDB."""
        match self.settings.provider:
            case "local":
                return load_sources_file(self.settings.sources_file)
            case "mongo":
                return load_sources_mongo(self.settings)
            case _:
                return []

    def get_source(self, key: str) -> HZDRSource | None:
        """Return one source by key, if configured."""
        return next(
            (source for source in self.list_sources() if source.key == key), None
        )

    def list_shots(self, key: str) -> list[HZDRShot]:
        """List shots for one HZDR source."""
        source = self.get_source(key)
        if source is None:
            return []
        return source.shots

    def get_shot(self, key: str, shot_number: int) -> HZDRShot | None:
        """Return one shot for one HZDR source."""
        return next(
            (shot for shot in self.list_shots(key) if shot.shot_number == shot_number),
            None,
        )

    def get_shot_by_key(self, key: str, shot_key: str) -> HZDRShot | None:
        """Return one shot by canonical date-scoped shot_key."""
        return next(
            (shot for shot in self.list_shots(key) if shot.shot_key == shot_key),
            None,
        )

    def get_shot_detail(self, key: str, shot_number: int) -> HZDRShotDetail | None:
        """Return one shot plus basic HDF5 file structure."""
        shot = self.get_shot(key, shot_number)
        if shot is None:
            return None
        return self._shot_detail(shot)

    def get_shot_detail_by_key(self, key: str, shot_key: str) -> HZDRShotDetail | None:
        """Return one date-scoped shot plus basic HDF5 file structure."""
        shot = self.get_shot_by_key(key, shot_key)
        if shot is None:
            return None
        return self._shot_detail(shot)

    def _product_reachable(self, product: HZDRDataProduct) -> bool | None:
        if not product.path or "://" in product.path:
            return None
        local = map_path(product.path, self._path_rules)
        return None if local is None else local.exists()

    def _shot_detail(self, shot: HZDRShot) -> HZDRShotDetail:
        # A view for this host; the stored shot keeps its recorded paths.
        shot = shot.model_copy(
            update={
                "data_products": [
                    product.model_copy(
                        update={"reachable": self._product_reachable(product)}
                    )
                    for product in shot.data_products
                ]
            }
        )
        detail = HZDRShotDetail(shot=shot)
        local_path = self.local_hdf5_path(shot)
        if local_path is None:
            return detail

        detail.hdf5_exists = local_path.exists()
        if not detail.hdf5_exists:
            return detail

        try:
            detail.hdf5_datasets = list_hdf5_datasets(local_path)
            if shot.shot_key:
                detail.container, datasets = list_container_datasets(
                    local_path, shot.shot_key
                )
                detail.hdf5_datasets.extend(datasets)
        except OSError as exc:
            detail.hdf5_error = str(exc)
        return detail

    def get_dataset_preview(
        self,
        key: str,
        shot_number: int,
        dataset_name: str,
        *,
        shot_key: str | None = None,
    ) -> HZDRDatasetPreview | None:
        """Return a small JSON-safe preview, preferring a date-scoped shot key."""
        shot = (
            self.get_shot_by_key(key, shot_key)
            if shot_key is not None
            else self.get_shot(key, shot_number)
        )
        if shot is None:
            return None
        local_path = self.local_hdf5_path(shot)
        if local_path is None or not local_path.exists():
            return None
        return preview_hdf5_dataset(local_path, dataset_name)


# One parsed catalog, the most recent one read. Home, Flow monitor and the
# shot page poll every few seconds and each request used to parse and
# validate the whole file again. Only one entry is ever kept (a different
# file replaces it), so memory stays at one catalog's worth.
_SOURCES_CACHE_LOCK = threading.Lock()
_sources_cache: tuple[tuple, list[HZDRSource]] | None = None
# A file changed this recently is re-read every time: a filesystem's
# timestamps can be too coarse to tell two quick writes apart (git's "racy"
# rule). The builder publishes by rename, which changes the inode anyway.
_SOURCES_CACHE_SETTLE_S = 2.0


def _sources_file_identity(path: Path) -> tuple | None:
    """What must stay the same for a cached parse to still be this file."""
    try:
        stat = path.stat()
    except OSError:
        return None
    if time.time() - stat.st_mtime < _SOURCES_CACHE_SETTLE_S:
        return None
    return (
        str(path.resolve()),
        stat.st_dev,
        stat.st_ino,
        stat.st_size,
        stat.st_mtime_ns,
        stat.st_ctime_ns,
    )


def clear_sources_cache() -> None:
    """Forget the cached catalog (tests, or after an in-place edit)."""
    global _sources_cache
    with _SOURCES_CACHE_LOCK:
        _sources_cache = None


def load_sources_file(path: Path | None) -> list[HZDRSource]:
    """Load tracked HZDR source metadata from a JSON file.

    The parse is reused while the file is unchanged (see ``_sources_cache``).
    The returned models are shared between requests: read them, copy them
    (``model_copy``) to change them, never modify them in place.
    """
    global _sources_cache
    if path is None or not path.exists():
        return []

    identity = _sources_file_identity(path)
    if identity is not None:
        with _SOURCES_CACHE_LOCK:
            cached = _sources_cache
        if cached is not None and cached[0] == identity:
            return list(cached[1])

    payload = orjson.loads(path.read_bytes())
    records = payload["sources"] if isinstance(payload, dict) else payload
    sources = [HZDRSource.model_validate(record) for record in records]
    # Store only if the file did not change while it was being read.
    if identity is not None and _sources_file_identity(path) == identity:
        with _SOURCES_CACHE_LOCK:
            _sources_cache = (identity, sources)
    return list(sources)


def list_hdf5_datasets(path: Path) -> list[HZDRHDF5Dataset]:
    """List datasets in a HDF5 file without loading full data arrays."""
    import h5py

    datasets: list[HZDRHDF5Dataset] = []
    with h5py.File(path, "r") as handle:

        def collect_dataset(name, item):
            if not isinstance(item, h5py.Dataset):
                return
            datasets.append(
                HZDRHDF5Dataset(
                    name=name,
                    shape=[int(value) for value in item.shape],
                    dtype=str(item.dtype),
                )
            )

        handle.visititems(collect_dataset)
    return datasets


def list_container_datasets(
    path: Path, shot_key: str
) -> tuple[str | None, list[HZDRHDF5Dataset]]:
    """The shot's container link in campaign file ``path``, and its datasets.

    ``visititems`` does not follow external links, so the campaign file's own
    listing stops at the root links to the containers; this follows the one for
    this shot. ``(None, [])`` when the file links no container for it, or the
    link does not resolve (the container is being replaced, or the folder was
    copied without ``shots/``).
    """
    import h5py

    from .hzdr_nexus import SHOTS_DIRNAME, shot_container_name

    try:
        stem = shot_container_name(shot_key).removesuffix(".nxs")
    except ValueError:
        return None, []
    link = stem
    datasets: list[HZDRHDF5Dataset] = []
    with h5py.File(path, "r") as handle:
        found = handle.get(link, getlink=True)
        if not isinstance(found, h5py.ExternalLink) or not found.filename.startswith(
            f"{SHOTS_DIRNAME}/"
        ):
            return None, []
        try:
            container = handle[link]
        except (KeyError, OSError):
            return None, []

        # The container is its own file, opened through the link: closing the
        # campaign file leaves it open until the garbage collector runs, and an
        # open file on Windows cannot be replaced, trashed or deleted.
        try:
            for name, item in _container_datasets(container):  # pyright: ignore[reportArgumentType]
                datasets.append(
                    HZDRHDF5Dataset(
                        name=f"{link}/{name}",
                        shape=[int(value) for value in item.shape],
                        dtype=str(item.dtype),
                    )
                )
        finally:
            container.file.close()
    return link, datasets


# Groups that hold second names for a detector's data: a mapping's definition
# subentry and its collection_/process_ groups (phase 4b, hard links).
def _is_view(group, name: str) -> bool:
    nx_class = group.attrs.get("NX_class", "")
    if isinstance(nx_class, bytes):
        nx_class = nx_class.decode()
    return nx_class == "NXsubentry" or name.startswith(("collection_", "process_"))


def _container_datasets(entry) -> list[tuple[str, Any]]:
    """Each dataset of a container once, under the detector's own name.

    ``visititems`` reports an object once, under its first name in name order,
    which for a dataset a mapping row linked can be its subentry name
    (``Reflected_515_Spectrometer/...`` sorts before
    ``Reflected_light_spectroscopy/...``). Every name is walked here and the
    one outside a mapping's view is kept; a derived value, which has no other
    name, is listed where the mapping wrote it.
    """
    import h5py

    best: dict[Any, tuple[bool, str, Any]] = {}

    def walk(group, prefix: str, in_view: bool, ancestors: tuple) -> None:
        for name in sorted(group):
            item = group.get(name)
            if item is None:
                continue  # a dangling link
            here = f"{prefix}{name}"
            if isinstance(item, h5py.Dataset):
                key = (in_view, here)
                if item.id not in best or key < best[item.id][:2]:
                    best[item.id] = (in_view, here, item)
            elif isinstance(item, h5py.Group) and item.id not in ancestors:
                view = in_view or _is_view(item, name)
                walk(item, f"{here}/", view, (*ancestors, item.id))

    walk(entry, "", False, (entry.id,))
    return sorted((name, item) for _, name, item in best.values())


def preview_hdf5_dataset(path: Path, dataset_name: str) -> HZDRDatasetPreview:
    """Read a small preview from a HDF5 dataset for UI display."""
    import h5py
    import numpy as np

    with h5py.File(path, "r") as handle:
        dataset = handle[dataset_name]
        shape = tuple(int(n) for n in dataset.shape)  # pyright: ignore[reportAttributeAccessIssue]
        # Read only what the preview shows: through a container link a
        # name can reach a camera stack of gigabytes, so the leading axes are
        # indexed to their first frame and the frame is read strided.
        summary_exact = True
        dtype = dataset.dtype  # pyright: ignore[reportAttributeAccessIssue]
        if not _plain_number_dtype(dtype) and len(shape) >= 1 and shape[0] > 1:
            # Text, compound or subarray values: nothing to draw or average.
            # (One subarray element per row would read as a whole matrix.)
            return HZDRDatasetPreview(
                name=dataset_name,
                dtype=str(dtype),
                shape=list(shape),
                preview=None,
                preview_kind="scalar",
                summary=None,
                summary_exact=False,
            )
        if len(shape) == 0 or (len(shape) == 1 and shape[0] == 1):
            data = np.asarray(dataset[()])  # pyright: ignore[reportIndexIssue]
            preview = data.reshape(-1)[0].item()
            preview_kind = "scalar"
            summary = _finite_mean(preview)
        elif len(shape) == 1:
            # The whole length, thinned evenly: the first N samples alone
            # misdraw any lineout longer than the preview.
            stride = max(1, -(-shape[0] // PREVIEW_LINE_POINTS))
            if shape[0] * dtype.itemsize <= PREVIEW_LINE_READ_WHOLE_BYTES:
                whole = np.asarray(dataset[()])  # pyright: ignore[reportIndexIssue]
                summary = _finite_mean(whole)
                data = whole[::stride]
            else:
                data = np.asarray(dataset[::stride])  # pyright: ignore[reportIndexIssue]
                summary = _finite_mean(data)
                summary_exact = False
            preview = data.astype(float).tolist()
            preview_kind = "line"
        else:
            lead = (0,) * (len(shape) - 2)
            # Rounded up: a 100-pixel side read at stride 1 and cut to 64
            # would preview (and average) only a corner of the frame.
            y_stride = max(1, -(-shape[-2] // PREVIEW_IMAGE_SIDE))
            x_stride = max(1, -(-shape[-1] // PREVIEW_IMAGE_SIDE))
            window = (*lead, slice(None, None, y_stride), slice(None, None, x_stride))
            image = np.asarray(dataset[window]).astype(float)  # pyright: ignore[reportIndexIssue]
            image = image[:PREVIEW_IMAGE_SIDE, :PREVIEW_IMAGE_SIDE]
            # From the strided frame: an estimate of what the column shows.
            summary = _finite_mean(image)
            summary_exact = image.size == int(np.prod(shape[-2:])) and not lead
            minimum = float(np.nanmin(image))
            maximum = float(np.nanmax(image))
            if maximum > minimum:
                image = (image - minimum) / (maximum - minimum)
            preview = image.tolist()
            preview_kind = "image"

        return HZDRDatasetPreview(
            name=dataset_name,
            dtype=str(dataset.dtype),  # pyright: ignore[reportAttributeAccessIssue]
            shape=[int(value) for value in dataset.shape],  # pyright: ignore[reportAttributeAccessIssue]
            preview=preview,
            preview_kind=preview_kind,
            summary=summary,
            summary_exact=summary_exact,
        )


def load_sources_mongo(settings: MetadataSettings) -> list[HZDRSource]:
    """Load HZDR source metadata from a local or deployment MongoDB."""
    from pymongo import MongoClient

    client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=2000)
    sources_collection = client[settings.mongo_database][settings.mongo_collection]
    shots_collection = _load_shots_collection(client, settings)
    try:
        records = sources_collection.find({}, projection={"_id": False})
        sources = [HZDRSource.model_validate(record) for record in records]
        if not sources and shots_collection is not None:
            sources = [_build_default_mongo_source(settings)]
        if shots_collection is None:
            return sources

        return [
            _populate_source_shots_from_collection(source, shots_collection, settings)
            for source in sources
        ]
    finally:
        client.close()


def _load_shots_collection(client, settings: MetadataSettings):
    """Return an optional Mongo collection for live HZDR shot rows."""
    if not settings.mongo_shots_database or not settings.mongo_shots_collection:
        return None
    return client[settings.mongo_shots_database][settings.mongo_shots_collection]


def _build_default_mongo_source(settings: MetadataSettings) -> HZDRSource:
    """Create a source wrapper when only a shot collection is configured."""
    return HZDRSource(
        key=settings.mongo_default_source_key,
        title=settings.mongo_default_source_title,
        damnit_path=settings.mongo_default_damnit_path,
        metadata={
            "facility": "HZDR",
            "source_type": "mongo-shots",
        },
    )


def _populate_source_shots_from_collection(source, shots_collection, settings):
    """Hydrate missing source shots from a dedicated MongoDB shots collection."""
    if source.shots:
        return source

    source_field = settings.mongo_shots_source_field
    query = {source_field: source.key} if source_field else {}
    records = shots_collection.find(query, projection={"_id": False})
    mapped_shots = [
        shot
        for record in records
        if (
            shot := _map_mongo_shot(
                record,
                source.key,
                shot_number_field=settings.mongo_shots_number_field,
                fired_at_field=settings.mongo_shots_fired_at_field,
            )
        )
    ]
    source.shots = mapped_shots
    return source


def _map_mongo_shot(
    record: dict[str, Any],
    source_key: str,
    *,
    shot_number_field: str,
    fired_at_field: str,
) -> HZDRShot | None:
    """Map one arbitrary MongoDB document into the HZDR shot API shape."""
    shot_number = record.get(
        shot_number_field,
        record.get("shot_number", record.get("shot", record.get("shotNumber"))),
    )
    if shot_number is None:
        return None

    fired_at_raw = record.get(
        fired_at_field,
        record.get("fired_at", record.get("timestamp", record.get("date_time"))),
    )
    if isinstance(fired_at_raw, datetime):
        fired_at = fired_at_raw.isoformat()
    elif fired_at_raw is None:
        fired_at = ""
    else:
        fired_at = str(fired_at_raw)

    hdf5_path_raw = record.get("hdf5_path")
    hdf5_path = Path(hdf5_path_raw) if isinstance(hdf5_path_raw, str) else None
    api_fields = {
        "source_key",
        "shot_number",
        "shot",
        "shotNumber",
        "fired_at",
        "timestamp",
        "date_time",
        "hdf5_path",
        "shot_key",
        "shot_date",
        "labfrog_record_id",
        "labfrog_date_time",
        "labfrog_local_count",
        "match_status",
        "match_quality",
        "match_time_delta_s",
        "nexus_entry",
        "events",
        "data_products",
    }
    metadata = {key: value for key, value in record.items() if key not in api_fields}

    return HZDRShot(
        source_key=source_key,
        shot_number=int(shot_number),
        fired_at=fired_at,
        shot_key=record.get("shot_key"),
        shot_date=record.get("shot_date"),
        labfrog_record_id=record.get("labfrog_record_id"),
        labfrog_date_time=record.get("labfrog_date_time", record.get("date_time")),
        labfrog_local_count=_optional_count(record.get("labfrog_local_count")),
        match_status=record.get("match_status"),
        match_quality=record.get("match_quality"),
        match_time_delta_s=record.get("match_time_delta_s"),
        hdf5_path=hdf5_path,
        nexus_entry=str(record.get("nexus_entry", "/entry")),
        metadata=metadata,
        events=record.get("events", []),
        data_products=record.get("data_products", []),
    )
