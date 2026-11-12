#!/usr/bin/env bash
# Run test suites for DAMNIT-web-hzdr and HZDR sibling repos.
#
# Usage:
#   ./hzdr/scripts/test-all.sh
#   ./hzdr/scripts/test-all.sh --with-acceptance
#   ./hzdr/scripts/test-all.sh --repos damnit,planet-watchdog
#
# Valid repo names: damnit, labfrog, sqlite-tools, planet-watchdog, shotcounter, asapo

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITLAB_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DAMNIT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

WITH_ACCEPTANCE=0
SELECTED_REPOS=()
REPOS_GIVEN=1

while [[ $# -gt 0 ]]; do
    case "$1" in
        --with-acceptance) WITH_ACCEPTANCE=1; shift ;;
        --repos) IFS=',' read -ra SELECTED_REPOS <<< "$2"; shift 2 ;;
        *) echo "Unknown argument: $1" >&2; exit 1 ;;
    esac
done

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; RESET='\033[0m'

declare -A RESULTS
declare -A SUITE_LABELS
ALL_KEYS=()

# -- Suite runner --------------------------------------------------------------
add_result() {
    local key="$1" label="$2" status="$3"
    SUITE_LABELS[$key]="$label"
    RESULTS[$key]="$status"
    ALL_KEYS+=("$key")
}

run_suite() {
    local key="$1" label="$2" path="$3"
    shift 3

    SUITE_LABELS[$key]="$label"
    ALL_KEYS+=("$key")

    if [[ -z "$path" || ! -d "$path" ]]; then
        RESULTS[$key]="SKIP (not found)"
        return
    fi

    echo ""
    echo -e "${CYAN}--- $label ---${RESET}"
    local start; start=$(date +%s)

    pushd "$path" > /dev/null
    set +e
    "$@"
    local exit_code=$?
    set -e
    popd > /dev/null

    local elapsed=$(( $(date +%s) - start ))
    if [[ $exit_code -eq 0 ]]; then
        RESULTS[$key]="PASS (${elapsed}s)"
    else
        RESULTS[$key]="FAIL (${elapsed}s)"
        echo -e "${RED}  ERROR: suite exited $exit_code${RESET}"
    fi
}

# -- Suite definitions ---------------------------------------------------------
suite_damnit() {
    local api_root="$DAMNIT_ROOT/api"
    cd "$api_root"
    if [[ ! -f ".env" && -f ".env.test.example" ]]; then
        cp ".env.test.example" ".env"
    fi
    export DW_API_DAMNIT_PATH="$api_root/.damnit-test"
    export DW_API_AUTH__MODE="ldap"
    uv run ruff check . --fix --quiet
    uv run ruff format . --quiet
    uv run ruff check .
    uv run python -m pytest -q
    if [[ $WITH_ACCEPTANCE -eq 1 ]]; then
        echo "  [acceptance]"
        uv run python scripts/hzdr-local-acceptance.py
        uv run python scripts/hzdr-local-acceptance.py --real-topology
    fi
}

suite_labfrog() {
    export LABFROG_TESTING=1
    export SKIP_CUSTOM_OPTIONS=1
    export SKIP_MEDIAWIKI=1
    # `-m "not kafka"` keeps this hermetic: the kafka-marked tests need a real
    # broker via Docker (testcontainers) and are run explicitly with `-m kafka`.
    uv run python -m pytest -q -s tests -k "not webkit" -m "not kafka"
}

suite_sqlite_tools() { uv run python -m pytest -q; }
suite_planet_watchdog() { uv run python -m pytest -q; }
suite_shotcounter() { uv run python -m pytest -q -k "not ntp"; }
suite_asapo() { uv run python -m pytest -q; }

# -- Suite dispatch ------------------------------------------------------------
declare -A VALID_KEYS=(
    [damnit]=1 [labfrog]=1 [sqlite-tools]=1
    [planet-watchdog]=1 [shotcounter]=1 [asapo]=1
)

repo_path() {
    case "$1" in
        damnit)         echo "$DAMNIT_ROOT" ;;
        labfrog)        echo "$GITLAB_ROOT/labfrog" ;;
        sqlite-tools)   echo "$GITLAB_ROOT/labfrog-sqlite-tools-repo" ;;
        planet-watchdog) echo "$GITLAB_ROOT/planet-watchdog" ;;
        shotcounter)    echo "$GITLAB_ROOT/shotcounter" ;;
        asapo)          echo "$GITLAB_ROOT/asapo-for-hzdr-damnit" ;;
    esac
}

repo_label() {
    case "$1" in
        damnit)         echo "DAMNIT-web-hzdr" ;;
        labfrog)        echo "labfrog" ;;
        sqlite-tools)   echo "labfrog-sqlite-tools-repo" ;;
        planet-watchdog) echo "planet-watchdog" ;;
        shotcounter)    echo "shotcounter" ;;
        asapo)          echo "asapo-for-hzdr-damnit" ;;
    esac
}

repo_fn() {
    case "$1" in
        damnit)         echo suite_damnit ;;
        labfrog)        echo suite_labfrog ;;
        sqlite-tools)   echo suite_sqlite_tools ;;
        planet-watchdog) echo suite_planet_watchdog ;;
        shotcounter)    echo suite_shotcounter ;;
        asapo)          echo suite_asapo ;;
    esac
}

if [[ ${#SELECTED_REPOS[@]} -eq 0 ]]; then
    REPOS_GIVEN=
    SELECTED_REPOS=(damnit labfrog sqlite-tools planet-watchdog shotcounter asapo)
fi

for key in "${SELECTED_REPOS[@]}"; do
    if [[ -z "${VALID_KEYS[$key]+x}" ]]; then
        echo "Unknown repo: $key. Valid: ${!VALID_KEYS[*]}" >&2
        exit 1
    fi
done

# -- Contract, reference fixture and pack code sync checks -------------------
# The same three checks as test-all.ps1, in check mode, failing on drift, and
# only when every repo is selected (each spans repos):
#   1. hzdr_event.py + its fixtures vendored into planet-watchdog/shotcounter,
#      and the topic-registry defaults (sync-hzdr-event.ps1; run through pwsh
#      when present, otherwise the same comparisons below);
#   2. shot-aligner's reference fixture (sync-hzdr-reference.sh);
#   3. shot-aligner's readers, pack helpers and manifests (sync-hzdr-packs.sh).
check_event_contract() {
    if command -v pwsh >/dev/null 2>&1; then
        pwsh -NoProfile -File "$SCRIPT_DIR/sync-hzdr-event.ps1"
        return $?
    fi
    local drift=0 api="$DAMNIT_ROOT/api"
    local watchdog="$GITLAB_ROOT/planet-watchdog" shot="$GITLAB_ROOT/shotcounter"
    echo ""
    echo -e "${CYAN}--- Contract sync (hzdr_event.py + fixtures) ---${RESET}"
    compare() {  # canonical copy label
        if [[ ! -f "$2" ]]; then
            echo -e "${RED}  DRIFT: $3 - not found at: $2${RESET}"; drift=1
        elif ! cmp -s "$1" "$2"; then
            echo -e "${RED}  DRIFT: $3 - differs from canonical${RESET}"; drift=1
        fi
    }
    if [[ -d "$watchdog" ]]; then
        compare "$api/src/damnit_api/metadata/hzdr_event.py" \
            "$watchdog/watchdog_core/hzdr_event.py" "planet-watchdog/watchdog_core/hzdr_event.py"
    else
        echo "  Skipped planet-watchdog (not found at $watchdog)"
    fi
    local root label file
    for root in "$watchdog" "$shot"; do
        label="$(basename "$root")"
        if [[ ! -d "$root" ]]; then
            echo "  Skipped $label (not found at $root)"; continue
        fi
        for file in hzdr-event-v1.schema.json hzdr-event-v1.sample.json; do
            compare "$api/tests/fixtures/$file" "$root/tests/fixtures/$file" \
                "$label/tests/fixtures/$file"
        done
    done
    local topics="$GITLAB_ROOT/kafka-broker-docker/topics.env"
    if [[ -f "$topics" ]]; then
        local draco watchdog_topic found
        draco="$(sed -n 's/^TOPIC_DRACO_TRIGGER=//p' "$topics" | tr -d '[:space:]')"
        watchdog_topic="$(sed -n 's/^TOPIC_WATCHDOG_EVENTS=//p' "$topics" | tr -d '[:space:]')"
        topic_check() {  # file pattern expected label
            [[ -f "$1" ]] || return 0
            found="$(grep -oP "$2" "$1" | head -1)"
            if [[ -n "$found" && "$found" != "$3" ]]; then
                echo -e "${RED}  DRIFT: $4 '$found' != registry '$3'${RESET}"; drift=1
            fi
        }
        topic_check "$shot/scripts/add_server.py" \
            '"KafkaTopic"[^"]*environ\.get\("[^"]+",\s*"\K[^"]+' "$draco" \
            "shotcounter/scripts/add_server.py KafkaTopic default"
        topic_check "$shot/scripts/start_local.sh" 'topic=\K\S+' "$draco" \
            "shotcounter/scripts/start_local.sh topic default"
        topic_check "$watchdog/watchdog_core/config.py" '"output_topic":\s*"\K[^"]+' \
            "$watchdog_topic" "planet-watchdog/watchdog_core/config.py output_topic"
        topic_check "$api/src/damnit_api/metadata/routers.py" \
            'WATCHDOG_KAFKA_TOPIC\s*=\s*"\K[^"]+' "$watchdog_topic" \
            "DAMNIT metadata/routers.py WATCHDOG_KAFKA_TOPIC"
    else
        echo "  Skipped topic-registry check (kafka-broker-docker not found)"
    fi
    if [[ $drift -ne 0 ]]; then
        echo -e "${YELLOW}  Run: pwsh hzdr/scripts/sync-hzdr-event.ps1 -Apply  to fix.${RESET}"
        return 1
    fi
    echo -e "${GREEN}  All contract copies and topic defaults in sync.${RESET}"
}

if [[ -z "${REPOS_GIVEN:-}" ]]; then
    if ! check_event_contract; then
        echo -e "${RED}  Contract drift.${RESET}"; exit 1
    fi
    echo ""
    if ! "$SCRIPT_DIR/sync-hzdr-reference.sh"; then
        echo -e "${RED}  Reference fixture drift.${RESET}"
        echo -e "${YELLOW}  Run: hzdr/scripts/sync-hzdr-reference.sh --apply  to fix.${RESET}"
        exit 1
    fi
    echo ""
    if ! "$SCRIPT_DIR/sync-hzdr-packs.sh"; then
        echo -e "${RED}  Vendored pack code drift.${RESET}"
        echo -e "${YELLOW}  Run: hzdr/scripts/sync-hzdr-packs.sh --apply  to fix.${RESET}"
        exit 1
    fi
fi

# -- Run -----------------------------------------------------------------------
START_ALL=$(date +%s)

for key in "${SELECTED_REPOS[@]}"; do
    fn=$(repo_fn "$key")
    run_suite "$key" "$(repo_label "$key")" "$(repo_path "$key")" "$fn"
done

# -- Summary -------------------------------------------------------------------
TOTAL_ELAPSED=$(( $(date +%s) - START_ALL ))
echo ""
echo -e "${CYAN}--- Summary (${TOTAL_ELAPSED}s) ---${RESET}"

ANY_FAIL=0
for key in "${ALL_KEYS[@]}"; do
    status="${RESULTS[$key]}"
    label="${SUITE_LABELS[$key]}"
    if [[ "$status" == PASS* ]]; then
        color="$GREEN"
    elif [[ "$status" == SKIP* ]]; then
        color="$YELLOW"
    else
        color="$RED"
        ANY_FAIL=1
    fi
    printf "${color}  %-30s %s${RESET}\n" "$label" "$status"
done

if [[ $ANY_FAIL -eq 1 ]]; then
    echo ""
    echo -e "${RED}One or more suites failed.${RESET}"
    exit 1
fi
