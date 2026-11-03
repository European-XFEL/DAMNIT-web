from pathlib import Path

import pytest

from damnit_api.shared import hzdr_paths
from damnit_api.shared.hzdr_paths import (
    fstab_mount_points,
    map_path,
    missing_mount,
    parse_path_map,
)

MOUNT = "/home/tippey/mnt/bigdata"


def test_empty_spec_is_no_rules():
    assert parse_path_map("") == []
    assert parse_path_map("  ") == []


def test_parse_splits_rules_in_order():
    rules = parse_path_map(f"/bigdata={MOUNT}, Z:/bigdata={MOUNT}")
    assert rules == [("/bigdata", MOUNT), ("Z:/bigdata", MOUNT)]


@pytest.mark.parametrize("spec", ["nonsense", "=/x", "/x=", "/a=/b,oops"])
def test_parse_rejects_malformed_entries(spec):
    with pytest.raises(ValueError, match="path map"):
        parse_path_map(spec)


@pytest.mark.parametrize(
    "raw",
    [
        "/bigdata/HPLexp/nexus/c.nxs",
        "Z:/bigdata/HPLexp/nexus/c.nxs",
        "Z:\\bigdata\\HPLexp\\nexus\\c.nxs",
        "z:/bigdata/HPLexp/nexus/c.nxs",
    ],
)
def test_published_and_windows_forms_map_to_the_mount(raw):
    rules = parse_path_map(f"/bigdata={MOUNT},Z:/bigdata={MOUNT}")
    assert map_path(raw, rules) == Path(MOUNT) / "HPLexp/nexus/c.nxs"


def test_unmatched_path_is_unchanged():
    rules = parse_path_map(f"/bigdata={MOUNT}")
    assert map_path("/data/damnit/x.h5", rules) == Path("/data/damnit/x.h5")


def test_prefix_must_end_at_a_path_boundary():
    rules = parse_path_map(f"/bigdata={MOUNT}")
    assert map_path("/bigdata2/x.h5", rules) == Path("/bigdata2/x.h5")


def test_longest_prefix_wins():
    rules = parse_path_map("/bigdata=/a,/bigdata/HPLexp=/b")
    assert map_path("/bigdata/HPLexp/x.h5", rules) == Path("/b/x.h5")


def test_exact_prefix_maps_to_the_mount_itself():
    rules = parse_path_map(f"/bigdata={MOUNT}")
    assert map_path("/bigdata", rules) == Path(MOUNT)


def test_none_and_no_rules_pass_through():
    assert map_path(None, parse_path_map(f"/bigdata={MOUNT}")) is None
    assert map_path("/bigdata/x", []) == Path("/bigdata/x")


def test_target_must_be_absolute():
    with pytest.raises(ValueError, match="absolute"):
        parse_path_map("/bigdata=mnt/bigdata")


def test_longest_prefix_is_judged_after_normalizing():
    # "/bigdata//////////" is longer as typed but is only "/bigdata"; the
    # genuinely longer "/bigdata/HPLexp" must still win.
    rules = parse_path_map("/bigdata//////////=/a,/bigdata/HPLexp=/b")
    assert map_path("/bigdata/HPLexp/x.h5", rules) == Path("/b/x.h5")


def test_unmatched_path_keeps_its_backslashes():
    # Returned as given, not in the slash form used for matching: on POSIX the
    # backslash stays part of the name. Path(raw), not the string, because on
    # Windows str() of any path prints backslashes.
    rules = parse_path_map(f"/bigdata={MOUNT}")
    raw = "/data/odd\\name.h5"
    assert map_path(raw, rules) == Path(raw)


def test_malformed_map_stops_settings_loading():
    from pydantic import ValidationError

    from damnit_api.shared.settings import MetadataSettings

    with pytest.raises(ValidationError, match="path map"):
        MetadataSettings(path_map="oops")


# --- missing_mount: never build into an unmounted share ---------------------


def _fstab(tmp_path, *points):
    fstab = tmp_path / "fstab"
    lines = [
        "# a comment",
        "UUID=abc / ext4 defaults 0 1",
        "/swap.img none swap sw 0 0",
    ]
    lines += [f"//server/share {point} cifs _netdev,nofail 0 0" for point in points]
    fstab.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return fstab


def test_fstab_mount_points_skip_comments_swap_and_decode_spaces(tmp_path):
    fstab = _fstab(tmp_path, r"/mnt/big\040data")
    assert fstab_mount_points(fstab) == {Path("/"), Path("/mnt/big data")}


def test_no_fstab_and_nothing_required_is_fine(tmp_path):
    assert missing_mount(tmp_path / "out", fstab=tmp_path / "absent") is None


def test_an_unmounted_fstab_share_above_the_output_is_named(tmp_path):
    share = tmp_path / "mnt" / "bigdata"
    share.mkdir(parents=True)
    fstab = _fstab(tmp_path, share)
    assert missing_mount(share / "HPLexp" / "nexus", fstab=fstab) == share


def test_a_mounted_fstab_share_passes(tmp_path, monkeypatch):
    share = tmp_path / "mnt" / "bigdata"
    fstab = _fstab(tmp_path, share)
    monkeypatch.setattr(hzdr_paths.os.path, "ismount", lambda p: Path(p) == share)
    assert missing_mount(share / "HPLexp" / "nexus", fstab=fstab) is None


def test_a_required_path_must_be_a_mount_point(tmp_path):
    absent = tmp_path / "absent"
    assert missing_mount(tmp_path / "out", [tmp_path], fstab=absent) == tmp_path
