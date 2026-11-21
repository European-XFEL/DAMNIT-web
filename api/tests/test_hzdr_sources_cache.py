"""The parsed catalog is reused while the file is unchanged, and only one."""

import os
import time

import orjson
import pytest

from damnit_api.metadata import hzdr_sources
from damnit_api.metadata.hzdr_sources import clear_sources_cache, load_sources_file


def _write(path, title):
    path.write_bytes(
        orjson.dumps({"sources": [{"key": "k", "title": title, "damnit_path": "/d"}]})
    )


def _age(path, seconds=60):
    old = time.time() - seconds
    os.utime(path, (old, old))


@pytest.fixture(autouse=True)
def _fresh_cache():
    clear_sources_cache()
    yield
    clear_sources_cache()


def test_an_unchanged_file_is_parsed_once(tmp_path, monkeypatch):
    path = tmp_path / "hzdr_sources.json"
    _write(path, "one")
    _age(path)
    first = load_sources_file(path)
    calls = []
    monkeypatch.setattr(
        hzdr_sources.orjson, "loads", lambda data: calls.append(1) or {}
    )
    second = load_sources_file(path)
    assert calls == []
    assert second[0] is first[0]
    # Each caller gets its own list.
    assert second is not first


def test_a_republished_file_is_read_again(tmp_path):
    path = tmp_path / "hzdr_sources.json"
    _write(path, "one")
    _age(path)
    assert load_sources_file(path)[0].title == "one"
    replacement = tmp_path / "next.json"
    _write(replacement, "two")
    _age(replacement, 30)
    replacement.replace(path)  # the builder publishes by rename
    assert load_sources_file(path)[0].title == "two"


def test_an_in_place_rewrite_with_the_same_size_and_mtime_is_read_again(tmp_path):
    path = tmp_path / "hzdr_sources.json"
    _write(path, "one")
    _age(path)
    stat = path.stat()
    assert load_sources_file(path)[0].title == "one"
    _write(path, "two")  # same length, same inode
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns))
    # ctime still moved, so the cached parse is not reused.
    assert load_sources_file(path)[0].title == "two"


def test_a_file_written_just_now_is_never_cached(tmp_path):
    path = tmp_path / "hzdr_sources.json"
    _write(path, "one")
    load_sources_file(path)
    assert hzdr_sources._sources_cache is None


def test_only_one_catalog_is_kept(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    _write(a, "a")
    _write(b, "b")
    _age(a)
    _age(b)
    load_sources_file(a)
    load_sources_file(b)
    cache = hzdr_sources._sources_cache
    assert cache is not None
    assert cache[0][0] == str(b.resolve())
    assert load_sources_file(a)[0].title == "a"
