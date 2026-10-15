import os
import subprocess
import sys
from pathlib import Path

from check_characters import Hit, find_characters, format_hit

COMMAND = Path(__file__).with_name("check_characters.py")

# Hooks and rebase --exec set GIT_INDEX_FILE or GIT_DIR. Left in place, git
# in the temporary repo would overwrite the index of the repo running tests.
GIT_FREE_ENV = {
    name: value for name, value in os.environ.items() if not name.startswith("GIT_")
}


def make_repo(repo, files):
    subprocess.run(["git", "init", "--quiet"], cwd=repo, env=GIT_FREE_ENV, check=True)
    for path, text in files.items():
        (repo / path).parent.mkdir(parents=True, exist_ok=True)
        (repo / path).write_text(text, encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=repo, env=GIT_FREE_ENV, check=True)

    return repo


def run_check(repo, paths=()):
    return subprocess.run(
        [sys.executable, COMMAND, *paths],
        cwd=repo,
        env=GIT_FREE_ENV,
        capture_output=True,
        text=True,
        check=False,
    )


def printed_lines(path, text):
    return [format_hit(path, hit) for hit in find_characters(text)]


# -----------------------------------------------------------------------------
# Characters the check reports


# Banned characters are written as escapes, so this file passes the check.
def test_a_curly_apostrophe_in_a_test_name_is_reported_at_its_line_and_column():
    text = "\n".join([
        "import { test } from 'vitest'",
        "",
        "test('reuses a run\u2019s cell map', () => {})",
    ])

    assert find_characters(text) == [Hit(line=3, column=19, code_point=0x2019)]


def test_an_emoji_before_a_hit_counts_as_one_column():
    text = "notify('🔒 You don\u2019t have access to this proposal')\n"

    assert find_characters(text) == [Hit(line=1, column=18, code_point=0x2019)]


def test_an_em_dash_in_a_markdown_sentence_is_reported_with_a_hyphen_to_use():
    text = "# Runs\n\nRuns load as you scroll \u2014 no paging.\n"

    assert printed_lines("README.md", text) == ["README.md:3:25 U+2014 (use -)"]


def test_a_minus_sign_before_a_number_is_reported():
    text = "energy_offset: \u22125\n"

    assert find_characters(text) == [Hit(line=1, column=16, code_point=0x2212)]


def test_a_no_break_space_before_a_unit_is_reported_with_a_plain_space_to_use():
    text = "Exposure: 10\u00a0ms\n"

    assert printed_lines("README.md", text) == ["README.md:1:13 U+00A0 (use a space)"]


def test_a_curly_apostrophe_saved_as_windows_1252_is_reported_as_not_utf_8():
    text = b"Don\x92t pause here\n".decode("utf-8", errors="replace")

    assert printed_lines("notes.md", text) == ["notes.md:1:4 U+FFFD (not UTF-8)"]


def test_a_text_direction_control_is_reported_as_invisible():
    text = "const role = 'user\u202e // admin'\n"

    assert printed_lines("auth.ts", text) == ["auth.ts:1:19 U+202E (invisible)"]


def test_a_terminal_colour_code_in_a_log_message_is_reported_as_invisible():
    text = 'log.error("\x1b[31mBeam lost")\n'

    assert printed_lines("run.py", text) == ["run.py:1:12 U+001B (invisible)"]


def test_a_zero_width_space_inside_a_word_is_reported():
    text = "SELECT proposal\u200b_id FROM runs\n"

    assert find_characters(text) == [Hit(line=1, column=16, code_point=0x200B)]


def test_a_combining_grapheme_joiner_inside_an_identifier_is_reported():
    text = "const is\u034fAdmin = user.role === 'admin'\n"

    assert find_characters(text) == [Hit(line=1, column=9, code_point=0x34F)]


def test_a_hangul_filler_used_as_a_variable_name_is_reported():
    text = "if (role === 'admin' || \u3164) {\n"

    assert find_characters(text) == [Hit(line=1, column=25, code_point=0x3164)]


def test_variation_selectors_hiding_a_payload_in_an_empty_looking_string_are_reported():
    text = "eval(decode('\ufe01\U000e0145'))\n"

    assert find_characters(text) == [
        Hit(line=1, column=14, code_point=0xFE01),
        Hit(line=1, column=15, code_point=0xE0145),
    ]


def test_only_the_stray_variation_selector_is_reported_not_the_one_drawing_an_emoji():
    text = "notify('⚠\ufe0f Beam lost')\nconst token = '\ufe01'\n"

    assert find_characters(text) == [Hit(line=2, column=16, code_point=0xFE01)]


def test_only_the_em_dash_is_reported_among_units_greek_math_arrows_and_box_drawing():
    text = "\n".join([
        "Pulse energy 1.2 µJ after a 5 μs delay, ħω = 9.3 keV",  # noqa: RUF001
        "Area 3 × 4 · 2 → mm²",  # noqa: RUF001
        "├── raw",
        "│   └── r0001.h5 \u2014 first run",
    ])

    assert find_characters(text) == [Hit(line=4, column=18, code_point=0x2014)]


def test_only_the_raw_em_dash_is_reported_not_an_escaped_one_or_an_html_entity():
    text = "const separator = '\\u2014'\n<p>Loading&hellip; \u2014 please wait</p>\n"

    assert find_characters(text) == [Hit(line=2, column=20, code_point=0x2014)]


def test_only_the_no_break_space_is_reported_among_spaces_tabs_and_crlf_line_ends():
    text = "run\tenergy\r\n12 1.2\u00a0mJ\r\n"

    assert find_characters(text) == [Hit(line=2, column=7, code_point=0xA0)]


# -----------------------------------------------------------------------------
# Running the check over a repo


def test_the_command_prints_each_hit_in_a_tracked_file_and_exits_1(tmp_path):
    repo = make_repo(
        tmp_path, {"doc.md": "Runs load as you scroll \u2014 no paging.\n"}
    )

    result = run_check(repo)

    assert result.stdout == "doc.md:1:25 U+2014 (use -)\n"
    assert result.returncode == 1


def test_the_command_reads_only_the_named_files_as_pre_commit_names_the_staged_ones(
    tmp_path,
):
    repo = make_repo(
        tmp_path,
        {
            "doc.md": "Runs load as you scroll \u2014 no paging.\n",
            "notes.md": "Beam lost \u2014 retry at 14:00.\n",
        },
    )

    result = run_check(repo, ["notes.md"])

    assert result.stdout == "notes.md:1:11 U+2014 (use -)\n"


def test_a_file_named_from_a_subdirectory_is_read_from_that_subdirectory(tmp_path):
    repo = make_repo(
        tmp_path,
        {
            "README.md": "Runs load as you scroll.\n",
            "frontend/README.md": "Runs load as you scroll \u2014 no paging.\n",
        },
    )

    result = run_check(repo / "frontend", ["README.md"])

    assert result.stdout == "frontend/README.md:1:25 U+2014 (use -)\n"


def test_a_named_file_with_brackets_is_read_as_its_name_not_as_a_pattern(tmp_path):
    repo = make_repo(
        tmp_path,
        {
            "routes/[id].tsx": "export const title = 'Run \u2014 details';\n",
            "routes/d.tsx": "export const title = 'Runs \u2014 all';\n",
        },
    )

    result = run_check(repo, ["routes/[id].tsx"])

    assert result.stdout == "routes/[id].tsx:1:27 U+2014 (use -)\n"


def test_the_command_skips_a_binary_file_but_reports_the_text_file_beside_it(tmp_path):
    (tmp_path / "runs.sqlite").write_bytes(b"SQLite format 3\x00\xe2\x80\x94")
    repo = make_repo(
        tmp_path, {"doc.md": "Runs load as you scroll \u2014 no paging.\n"}
    )

    result = run_check(repo)

    assert result.stdout == "doc.md:1:25 U+2014 (use -)\n"


def test_the_command_skips_a_tracked_file_that_was_deleted_from_disk(tmp_path):
    repo = make_repo(
        tmp_path,
        {
            "doc.md": "Runs load as you scroll \u2014 no paging.\n",
            "old.md": "Beam lost \u2014 retry at 14:00.\n",
        },
    )
    (repo / "old.md").unlink()

    result = run_check(repo)

    assert result.stdout == "doc.md:1:25 U+2014 (use -)\n"
    assert result.stderr == ""
