#!/usr/bin/env bash
set -euo pipefail

HOST_ADDRESS="0.0.0.0"
PORT=8000
WORKERS=1
ENV_FILE=".env"
NO_ENV_FILE=false

usage() {
  cat <<'EOF'
Usage: bash scripts/damnit-api-deploy.sh [options]

Run from the api/ directory (or anywhere; the script cds to api/ itself).

Options:
  --host ADDRESS      Bind address (default: 0.0.0.0).
  --port PORT         Bind port (default: 8000).
  --workers N         Uvicorn worker count (default: 1).
  --env-file PATH     Env file to require exists (default: .env).
  --no-env-file       Skip the env-file existence check.
  -h, --help          Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST_ADDRESS="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --workers)
      WORKERS="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --no-env-file)
      NO_ENV_FILE=true
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
API_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$API_ROOT"

if [[ "$NO_ENV_FILE" != true && ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

export DW_API_UVICORN__HOST="$HOST_ADDRESS"
export DW_API_UVICORN__PORT="$PORT"
export DW_API_UVICORN__RELOAD=false

UVICORN_ARGS=(run uvicorn damnit_api.main:create_app --factory --host "$HOST_ADDRESS" --port "$PORT")
if [[ "$WORKERS" -gt 1 ]]; then
  UVICORN_ARGS+=(--workers "$WORKERS")
fi

if [[ "$NO_ENV_FILE" != true ]]; then
  echo "Using environment file: $ENV_FILE"
fi

echo "Starting DAMNIT-web API for deployment on ${HOST_ADDRESS}:${PORT}"
exec uv "${UVICORN_ARGS[@]}"
