#!/usr/bin/env bash
# Run test suites for DAMNIT-web-hzdr and HZDR sibling repos.
#
# Usage:
#   ./scripts/test-all.sh
#   ./scripts/test-all.sh --with-acceptance
#   ./scripts/test-all.sh --repos damnit,planet-watchdog
#
# Valid repo names: damnit, labfrog, sqlite-tools, planet-watchdog, shotcounter, asapo

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITLAB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DAMNIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

WITH_ACCEPTANCE=0
SELECTED_REPOS=()

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
    fi
}

suite_labfrog() {
    export LABFROG_TESTING=1
    export SKIP_CUSTOM_OPTIONS=1
    export SKIP_MEDIAWIKI=1
    uv run --group testing python -m pytest -q -s tests -k "not webkit"
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
    SELECTED_REPOS=(damnit labfrog sqlite-tools planet-watchdog shotcounter asapo)
fi

for key in "${SELECTED_REPOS[@]}"; do
    if [[ -z "${VALID_KEYS[$key]+x}" ]]; then
        echo "Unknown repo: $key. Valid: ${!VALID_KEYS[*]}" >&2
        exit 1
    fi
done

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
