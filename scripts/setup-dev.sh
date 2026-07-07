#!/usr/bin/env bash
set -eo pipefail

cd "$(dirname "$0")/.."

if ! command -v uv &>/dev/null; then
    echo >&2 "uv not found. Install it: https://docs.astral.sh/uv/getting-started/installation/"
    exit 1
fi

uv sync
uv run pre-commit install

. scripts/ensure-node.sh
(cd frontend && pnpm install)

echo "Dev environment ready."
