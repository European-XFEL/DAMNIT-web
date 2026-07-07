"""Run frontend pre-commit hooks from the native Python environment."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"


def _pnpm_executable() -> str:
    for name in ("pnpm.cmd", "pnpm"):
        executable = shutil.which(name)
        if executable:
            return executable
    raise SystemExit(
        "pnpm not found. Run 'corepack enable' with Node >= 24, then retry pre-commit."
    )


def _frontend_paths(paths: list[str]) -> list[str]:
    prefix = "frontend/"
    return [path[len(prefix) :] if path.startswith(prefix) else path for path in paths]


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit("usage: run_frontend_hook.py <eslint|prettier|tsc> [files...]")

    hook = sys.argv[1]
    files = _frontend_paths(sys.argv[2:])
    pnpm = _pnpm_executable()

    if hook == "eslint":
        command = [
            pnpm,
            "exec",
            "eslint",
            "--fix",
            "--cache",
            "--cache-location",
            "node_modules/.cache/eslint/.eslintcache",
            *files,
        ]
    elif hook == "prettier":
        command = [pnpm, "exec", "prettier", "--write", *files]
    elif hook == "tsc":
        command = [pnpm, "exec", "tsc", "-b", "--noEmit"]
    else:
        raise SystemExit(f"unknown frontend hook: {hook}")

    return subprocess.run(command, cwd=FRONTEND).returncode


if __name__ == "__main__":
    raise SystemExit(main())
