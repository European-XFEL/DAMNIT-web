#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH=""
INIT_CONFIG=false
NO_API=false
NO_GUI=false
NO_BROKER=false
NO_SMOKE=false
VALIDATE_ONLY=false

usage() {
  cat <<'EOF'
Usage: bash scripts/hzdr-launch.sh [options]

Options:
  --config PATH       Use a non-default launcher config JSON.
  --init-config       Copy hzdr-launch.config.example.json to the selected path.
  --no-api            Prepare data and GUI only; do not start the API.
  --no-gui            Do not start the frontend dev server.
  --no-broker         Do not start the local ASAPO-style broker.
  --no-smoke          Skip the source-provider smoke check before startup.
  --validate-only     Validate config, paths, and tools without starting services.
  -h, --help          Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG_PATH="${2:-}"
      shift 2
      ;;
    --init-config)
      INIT_CONFIG=true
      shift
      ;;
    --no-api)
      NO_API=true
      shift
      ;;
    --no-gui)
      NO_GUI=true
      shift
      ;;
    --no-broker)
      NO_BROKER=true
      shift
      ;;
    --no-smoke)
      NO_SMOKE=true
      shift
      ;;
    --validate-only)
      VALIDATE_ONLY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_CONFIG_PATH="$SCRIPT_DIR/hzdr-launch.config.json"
EXAMPLE_CONFIG_PATH="$SCRIPT_DIR/hzdr-launch.config.example.json"
SELECTED_CONFIG_PATH="${CONFIG_PATH:-$DEFAULT_CONFIG_PATH}"
if [[ "$SELECTED_CONFIG_PATH" != /* ]]; then
  SELECTED_CONFIG_PATH="$PWD/$SELECTED_CONFIG_PATH"
fi

PYTHON_BIN="$(command -v python3 || command -v python || true)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo "python3 or python is required for config parsing." >&2
  exit 1
fi

if [[ "$INIT_CONFIG" == true ]]; then
  if [[ -e "$SELECTED_CONFIG_PATH" ]]; then
    echo "Config already exists: $SELECTED_CONFIG_PATH"
  else
    mkdir -p "$(dirname "$SELECTED_CONFIG_PATH")"
    cp "$EXAMPLE_CONFIG_PATH" "$SELECTED_CONFIG_PATH"
    echo "Created config: $SELECTED_CONFIG_PATH"
  fi
  echo "Edit repository paths if your checkout does not use sibling directories, then run:"
  echo "bash scripts/hzdr-launch.sh"
  exit 0
fi

if [[ ! -f "$SELECTED_CONFIG_PATH" ]]; then
  echo "Config file not found: $SELECTED_CONFIG_PATH. Create one with --init-config." >&2
  exit 1
fi

CONFIG_DIR="$(cd "$(dirname "$SELECTED_CONFIG_PATH")" && pwd)"

config_get() {
  local key="$1"
  local default="${2:-}"
  "$PYTHON_BIN" - "$SELECTED_CONFIG_PATH" "$key" "$default" <<'PY'
import json
import sys

path, key, default = sys.argv[1:4]
with open(path, encoding="utf-8") as handle:
    value = json.load(handle)
for part in key.split("."):
    if isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is None or value == "":
    value = default
if isinstance(value, bool):
    print("true" if value else "false")
else:
    print(value)
PY
}

# Dump one nested object (e.g. flowMonitor.producers.shotcounter) as compact
# JSON, or nothing if missing, so it can be forwarded as one
# DW_API_FLOW_MONITOR__PRODUCERS__<NAME> env var. pydantic-settings decodes
# JSON for any complex field at any nesting level, so the API accepts this
# the same way it accepts a single boolean leaf env var.
config_get_json() {
  local key="$1"
  "$PYTHON_BIN" - "$SELECTED_CONFIG_PATH" "$key" <<'PY'
import json
import sys

path, key = sys.argv[1:3]
with open(path, encoding="utf-8") as handle:
    value = json.load(handle)
for part in key.split("."):
    if isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is not None:
    print(json.dumps(value))
PY
}

find_related_repository() {
  local repo_name="$1"
  local current="$REPO_ROOT"
  while :; do
    local candidate="$current/$repo_name"
    if [[ -d "$candidate" ]]; then
      (cd "$candidate" && pwd)
      return
    fi

    local parent
    parent="$(dirname "$current")"
    if [[ "$parent" == "$current" ]]; then
      return 1
    fi
    current="$parent"
  done
}

resolve_repository_path() {
  local value="$1"
  local label="$2"
  local repo_name="$3"
  local default_path="${4:-}"
  local candidate=""

  if [[ -n "$value" ]]; then
    if [[ "$value" == /* ]]; then
      candidate="$value"
    else
      candidate="$CONFIG_DIR/$value"
    fi
    if [[ -d "$candidate" ]]; then
      (cd "$candidate" && pwd)
      return
    fi
  fi

  if [[ -n "$default_path" && -d "$default_path" ]]; then
    (cd "$default_path" && pwd)
    return
  fi

  if discovered="$(find_related_repository "$repo_name")"; then
    echo "$discovered"
    return
  fi

  echo "Could not find $label repository. Set repositories.$repo_name in the launch config, or place $repo_name in this checkout or a parent folder." >&2
  exit 1
}

resolve_optional_repository_path() {
  local value="$1"
  local repo_name="$2"

  if [[ -n "$value" ]]; then
    local candidate
    if [[ "$value" == /* ]]; then
      candidate="$value"
    else
      candidate="$CONFIG_DIR/$value"
    fi
    if [[ -d "$candidate" ]]; then
      (cd "$candidate" && pwd)
      return
    fi
  fi

  if discovered="$(find_related_repository "$repo_name")"; then
    echo "$discovered"
    return
  fi

  echo ""
}

resolve_output_path() {
  local value="$1"
  local default="$2"
  local selected="${value:-$default}"
  if [[ "$selected" == /* ]]; then
    realpath -m "$selected"
  else
    realpath -m "$CONFIG_DIR/$selected"
  fi
}

default_events_dir() {
  local examples_dir="$ASAPO_ROOT/examples"
  if [[ -d "$examples_dir" ]] && find "$examples_dir" -maxdepth 1 -type f -name '*.json' -print -quit | grep -q .; then
    (cd "$examples_dir" && pwd)
    return
  fi

  if find "$ASAPO_ROOT" -maxdepth 1 -type f -name '*.json' -print -quit | grep -q .; then
    (cd "$ASAPO_ROOT" && pwd)
    return
  fi

  echo "$examples_dir"
}

command_available() {
  command -v "$1" >/dev/null 2>&1
}

write_step() {
  echo
  echo "== $1 =="
}

tcp_port_reachable() {
  "$PYTHON_BIN" - "$1" "$2" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
try:
    with socket.create_connection((host, port), timeout=1.0):
        pass
except OSError:
    raise SystemExit(1)
PY
}

wait_tcp_port() {
  local name="$1"
  local host="$2"
  local port="$3"
  local timeout="${4:-45}"
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if tcp_port_reachable "$host" "$port"; then
      echo "$name is reachable at $host:$port"
      return
    fi
    sleep 1
  done
  echo "$name did not become reachable at $host:$port within ${timeout}s" >&2
  exit 1
}

start_asapo_local_broker() {
  local asapo_root="$1"
  local damnit_root="$2"
  local port="$3"
  if tcp_port_reachable "127.0.0.1" "$port"; then
    echo "ASAPO local broker already reachable at 127.0.0.1:$port"
    return
  fi

  local spool_dir="$damnit_root/.generated/asapo-broker-spool"
  mkdir -p "$spool_dir"
  local stdout="$spool_dir/local-broker.stdout.log"
  local stderr="$spool_dir/local-broker.stderr.log"

  pushd "$asapo_root" >/dev/null
  if command_available node; then
    nohup node tools/local-message-suite.js broker \
      --port "$port" \
      --spool-dir "$spool_dir" \
      >"$stdout" 2>"$stderr" &
  elif command_available python3; then
    nohup python3 tools/local_message_suite.py broker \
      --port "$port" \
      --spool-dir "$spool_dir" \
      >"$stdout" 2>"$stderr" &
  else
    popd >/dev/null
    echo "Neither node nor python3 is available for the ASAPO local broker." >&2
    exit 1
  fi
  popd >/dev/null

  wait_tcp_port "ASAPO local broker" "127.0.0.1" "$port"
}

start_docker_service() {
  local name="$1"
  local root="$2"
  local port="$3"
  shift 3
  if ! command_available docker; then
    echo "docker is required to start $name." >&2
    exit 1
  fi
  write_step "Starting $name"
  (cd "$root" && docker "$@")
  wait_tcp_port "$name" "127.0.0.1" "$port"
}

select_pnpm_command() {
  if ! command_available node; then
    echo "node is required for GUI startup. Install Node >= 24." >&2
    exit 1
  fi

  local node_major
  node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if (( node_major < 24 )); then
    echo "Node >= 24 is required for GUI startup; found $(node --version)." >&2
    exit 1
  fi

  if command_available pnpm; then
    PNPM_COMMAND=(pnpm)
  elif command_available corepack; then
    PNPM_COMMAND=(corepack pnpm)
  else
    echo "Neither pnpm nor corepack is on PATH. Install Node >= 24, then run: corepack enable" >&2
    exit 1
  fi
}

DAMNIT_ROOT="$(resolve_repository_path "$(config_get repositories.damnitWeb)" "DAMNIT-web" "DAMNIT-web-hzdr" "$REPO_ROOT")"
ASAPO_ROOT="$(resolve_repository_path "$(config_get repositories.asapoHarness)" "ASAPO harness" "asapo-for-hzdr-damnit")"
KAFKA_ROOT="$(resolve_repository_path "$(config_get repositories.kafkaBroker)" "Kafka broker" "kafka-broker-docker")"
LABFROG_ROOT="$(resolve_repository_path "$(config_get repositories.labfrog)" "LabFrog" "labfrog")"
LABFROG_SQLITE_TOOLS_ROOT="$(resolve_repository_path "$(config_get repositories.labfrogSqliteTools)" "LabFrog SQLite tools" "labfrog-sqlite-tools-repo")"
PLANET_WATCHDOG_ROOT="$(resolve_repository_path "$(config_get repositories.planetWatchdog)" "PLANET Watchdog" "planet-watchdog")"
 
API_PORT="$(config_get ports.api 8000)"
GUI_PORT="$(config_get ports.gui 5173)"
ASAPO_PORT="$(config_get ports.asapoBroker 8765)"
KAFKA_PORT="$(config_get ports.kafka 9092)"
MONGO_PORT="$(config_get ports.mongo 27018)"

SOURCE_KEY="$(config_get emulator.sourceKey hzdr-emulator)"
EXPERIMENT_ID="$(config_get emulator.experimentId)"
SHOT_COUNT="$(config_get emulator.shotCount 6)"
SHOT_INCREMENT="$(config_get emulator.shotIncrement 1)"
EVENTS_DIR="$(resolve_output_path "$(config_get emulator.eventsDir)" "$(default_events_dir)")"
OUTPUT_DIR="$(resolve_output_path "$(config_get emulator.outputDir)" "$DAMNIT_ROOT/.generated/hzdr-package-emulator")"

write_step "Configuration"
echo "DAMNIT-web: $DAMNIT_ROOT"
echo "ASAPO harness: $ASAPO_ROOT"
echo "Kafka broker: $KAFKA_ROOT"
echo "LabFrog: $LABFROG_ROOT"
echo "LabFrog SQLite tools: $LABFROG_SQLITE_TOOLS_ROOT"
echo "PLANET Watchdog: $PLANET_WATCHDOG_ROOT"

echo "Event packages: $EVENTS_DIR"
echo "Emulator output: $OUTPUT_DIR"
echo "Generated shots: $SHOT_COUNT, increment: $SHOT_INCREMENT"
echo "Flow monitor: http://127.0.0.1:$GUI_PORT/flow-monitor"

write_step "Prerequisites"
for command_name in uv node; do
  if command_available "$command_name"; then
    echo "$command_name found"
  else
    echo "Warning: $command_name was not found on PATH" >&2
  fi
done
if command_available pnpm; then
  echo "pnpm found"
elif command_available corepack; then
  echo "corepack found; GUI startup can use corepack pnpm"
else
  echo "Warning: neither pnpm nor corepack was found for GUI startup" >&2
fi

if [[ "$VALIDATE_ONLY" == true ]]; then
  echo "Validation complete. Nothing was started because --validate-only was set."
  exit 0
fi

if [[ "$(config_get emulator.startLabfrog false)" == "true" ]]; then
  start_docker_service "LabFrog MongoDB" "$LABFROG_ROOT" "$MONGO_PORT" \
    compose -f compose.yaml up -d mongo mongo-express
fi

if [[ "$(config_get emulator.startKafka false)" == "true" ]]; then
  start_docker_service "Kafka" "$KAFKA_ROOT" "$KAFKA_PORT" compose up -d
fi

if [[ "$(config_get emulator.startAsapoBroker false)" == "true" && "$NO_BROKER" == false ]]; then
  write_step "Starting ASAPO-style local broker"
  start_asapo_local_broker "$ASAPO_ROOT" "$DAMNIT_ROOT" "$ASAPO_PORT"
fi

write_step "Generating package emulator output"
API_ROOT="$DAMNIT_ROOT/api"
EMULATOR_ARGUMENTS=(
  run
  python
  scripts/hzdr-package-emulator.py
  --events-dir "$EVENTS_DIR"
  --output-dir "$OUTPUT_DIR"
  --source-key "$SOURCE_KEY"
  --shot-count "$SHOT_COUNT"
  --shot-increment "$SHOT_INCREMENT"
)
if [[ -n "$EXPERIMENT_ID" ]]; then
  EMULATOR_ARGUMENTS+=(--experiment-id "$EXPERIMENT_ID")
fi
(cd "$API_ROOT" && uv "${EMULATOR_ARGUMENTS[@]}")

SOURCES_FILE="$OUTPUT_DIR/hzdr_sources.json"
if [[ ! -f "$SOURCES_FILE" ]]; then
  echo "Package emulator did not create expected sources file: $SOURCES_FILE" >&2
  exit 1
fi

export DW_API_AUTH__MODE=ldap
export DW_API_DEBUG=true
export DW_API_LOG_LEVEL=DEBUG
export DW_API_METADATA__PROVIDER=local
export DW_API_METADATA__SOURCES_FILE="$SOURCES_FILE"
export DW_API_DEPLOYMENT__PROFILE=hzdr
export DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_NAME=source
export DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_NAME_PLURAL=sources
export DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL=Source
export DW_API_DEPLOYMENT__TERMINOLOGY__IDENTITY_LABEL_PLURAL=Sources
export DW_API_DEPLOYMENT__TERMINOLOGY__COLLECTION_LABEL="HZDR sources"
export DW_API_DEPLOYMENT__TERMINOLOGY__USES_PROPOSALS=false
export DW_API_DEPLOYMENT__TERMINOLOGY__USES_MYMDC=false
export DW_API_FLOW_MONITOR__RECEIVERS__LASER_DATA="$(config_get flowMonitor.receivers.laserData true)"
export DW_API_FLOW_MONITOR__RECEIVERS__WATCHDOG="$(config_get flowMonitor.receivers.watchdog true)"
export DW_API_FLOW_MONITOR__RECEIVERS__MONGO="$(config_get flowMonitor.receivers.mongo true)"
# Per-producer-box settings (Shotcounter TKEYs, Watchdog watcher rules, Mongo
# sqlite sync, ...) come from this launch config file's flowMonitor.producers
# section. Each is forwarded as one JSON env var, matching how the API
# already accepts DW_API_*__... settings - so the frontend's Flow Monitor
# renders whatever is configured here instead of a hard-coded option list.
# Producers omitted from the config keep the API's built-in defaults.
FLOW_MONITOR_SHOTCOUNTER_JSON="$(config_get_json flowMonitor.producers.shotcounter)"
[[ -n "$FLOW_MONITOR_SHOTCOUNTER_JSON" ]] && export DW_API_FLOW_MONITOR__PRODUCERS__SHOTCOUNTER="$FLOW_MONITOR_SHOTCOUNTER_JSON"
FLOW_MONITOR_LASER_DATA_JSON="$(config_get_json flowMonitor.producers.laserData)"
[[ -n "$FLOW_MONITOR_LASER_DATA_JSON" ]] && export DW_API_FLOW_MONITOR__PRODUCERS__LASER_DATA="$FLOW_MONITOR_LASER_DATA_JSON"
FLOW_MONITOR_WATCHDOG_JSON="$(config_get_json flowMonitor.producers.watchdog)"
[[ -n "$FLOW_MONITOR_WATCHDOG_JSON" ]] && export DW_API_FLOW_MONITOR__PRODUCERS__WATCHDOG="$FLOW_MONITOR_WATCHDOG_JSON"
FLOW_MONITOR_MONGO_JSON="$(config_get_json flowMonitor.producers.mongo)"
[[ -n "$FLOW_MONITOR_MONGO_JSON" ]] && export DW_API_FLOW_MONITOR__PRODUCERS__MONGO="$FLOW_MONITOR_MONGO_JSON"
export DW_API_UVICORN__HOST=127.0.0.1
export DW_API_UVICORN__PORT="$API_PORT"
export DW_API_UVICORN__RELOAD=true

if [[ "$NO_SMOKE" == false ]]; then
  write_step "Checking HZDR source provider"
  (
    cd "$API_ROOT"
    uv run python - <<'PY'
from damnit_api.metadata.hzdr_sources import HZDRSourceProvider
from damnit_api.shared.settings import settings

sources = HZDRSourceProvider(settings.metadata).list_sources()
print("Loaded {} HZDR source(s): {}".format(len(sources), [source.key for source in sources]))
for source in sources:
    print("  {}: {} shot(s)".format(source.key, len(source.shots)))
if not sources:
    raise SystemExit("No HZDR sources loaded")
if not any(source.shots for source in sources):
    raise SystemExit("HZDR sources loaded, but no shots were found")
PY
  )
fi

GUI_PID=""
cleanup() {
  if [[ -n "$GUI_PID" ]]; then
    kill "$GUI_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "$NO_GUI" == false ]]; then
  write_step "Starting DAMNIT-web GUI"
  select_pnpm_command
  FRONTEND_ROOT="$DAMNIT_ROOT/frontend"
  (
    cd "$FRONTEND_ROOT"
    if [[ ! -d node_modules ]]; then
      "${PNPM_COMMAND[@]}" install
    fi
    VITE_API="http://127.0.0.1:$API_PORT" \
      VITE_PORT="$GUI_PORT" \
      "${PNPM_COMMAND[@]}" --filter @damnit-frontend/app dev
  ) &
  GUI_PID="$!"
  echo "GUI: http://127.0.0.1:$GUI_PORT/home"
  echo "Flow monitor: http://127.0.0.1:$GUI_PORT/flow-monitor"
fi

if [[ "$(config_get emulator.openFlowMonitor false)" == "true" && "$NO_GUI" == false ]]; then
  if command_available xdg-open; then
    xdg-open "http://127.0.0.1:$GUI_PORT/flow-monitor" >/dev/null 2>&1 || true
  fi
fi

write_step "DAMNIT-web endpoints"
echo "Home: http://127.0.0.1:$GUI_PORT/home"
echo "Flow monitor: http://127.0.0.1:$GUI_PORT/flow-monitor"
echo "API sources: http://127.0.0.1:$API_PORT/metadata/hzdr/sources"

if [[ "$NO_API" == false ]]; then
  write_step "Starting DAMNIT-web API"
  (cd "$API_ROOT" && uv run -m damnit_api.main)
elif [[ -n "$GUI_PID" ]]; then
  echo "API start skipped because --no-api was set. Waiting for GUI process."
  wait "$GUI_PID"
else
  echo "Setup complete. API start skipped because --no-api was set."
fi
