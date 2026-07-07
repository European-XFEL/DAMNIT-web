#!/usr/bin/env bash
set -euo pipefail

WITH_ACCEPTANCE=false

usage() {
  cat <<'EOF'
Usage: bash hzdr/scripts/test.sh [options]

Options:
  --with-acceptance   Also run the local acceptance script (no broker).
  -h, --help          Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-acceptance)
      WITH_ACCEPTANCE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_ROOT="$REPO/api"

# Run from api/, not the repo root: api/.env (auth/metadata config consumed
# by Settings()) and api/ruff.toml are resolved relative to cwd, and
# api/tests assumes that layout too (see hzdr/docs/status/testing.md). pushd/popd so the
# caller's shell returns to its starting folder.
pushd "$API_ROOT" >/dev/null
trap 'popd >/dev/null' EXIT

if [[ ! -f .env && -f .env.test.example ]]; then
  cp .env.test.example .env
fi

export DW_API_DAMNIT_PATH="$API_ROOT/.damnit-test"
export DW_API_AUTH__MODE="ldap"

uv run ruff check . --fix
uv run ruff format .
uv run ruff check .
uv run pytest

if [[ "$WITH_ACCEPTANCE" == true ]]; then
  uv run python scripts/hzdr-local-acceptance.py
fi
