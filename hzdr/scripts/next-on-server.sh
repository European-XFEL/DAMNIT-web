#!/usr/bin/env bash
#
# The open server work on fwkt-webapps, in one place (handoff 2026-11-11).
# The checklist that goes with it: hzdr/docs/guides/next-on-server.md.
#
#   bash hzdr/scripts/next-on-server.sh                 look only: what would be done
#   bash hzdr/scripts/next-on-server.sh --apply         do it
#   bash hzdr/scripts/next-on-server.sh --apply --step deploy   one step only
#   bash hzdr/scripts/next-on-server.sh --apply --all-campaigns also rebuild old campaigns
#
# Steps, in order (each can be named with --step, repeatable):
#   pull     fast-forward every checkout (fwkt-webapps/pull-all-repos.sh)
#   deploy   a unit whose checkout moved after it started runs old code:
#            sync that checkout, then restart its units (a pull is not a deploy)
#   tidy     hide the two untracked folders server-report.sh warns about, kept
#            on purpose; move the 2024-08-08 rulings copy aside once it matches
#   rebuild  rebuild the DAMNIT campaigns with the auto-trigger's own command,
#            then check each campaign file for bridge v6's authority_shot_number
#   labfrog  Beamtime Setup's settings: which are set (values are never printed)
#   report   check-shot-intake, server-report.sh, report-deployed.sh (snapshot)
#
# Run it as tippey (the owner of the checkouts), NOT with sudo; it calls sudo
# only for `systemctl restart`. Without --apply it changes nothing. It never
# prints a settings file. Exit status: number of steps that ended in FAIL.

set -uo pipefail

ROOT="${FWKT_ROOT:-$HOME}"
APPLY=0
ALL_CAMPAIGNS=0
STEPS=()
ALL_STEPS=(pull deploy tidy rebuild labfrog report)
UV="${UV:-$HOME/.local/bin/uv}"
DAMNIT_URL="${DAMNIT_URL:-http://127.0.0.1:8000}"
STAMP="$(date +%Y%m%d-%H%M)"

usage() { sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1 ;;
        --all-campaigns) ALL_CAMPAIGNS=1 ;;
        --step)
            [ $# -ge 2 ] || { echo "--step needs a name" >&2; exit 2; }
            STEPS+=("$2"); shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done
[ ${#STEPS[@]} -gt 0 ] || STEPS=("${ALL_STEPS[@]}")
for s in "${STEPS[@]}"; do
    case " ${ALL_STEPS[*]} " in *" $s "*) ;; *) echo "unknown step: $s" >&2; exit 2 ;; esac
done

if [ "$(id -u)" -eq 0 ]; then
    echo "Refusing to run as root: run it as the user who owns the checkouts." >&2
    exit 2
fi
command -v "$UV" >/dev/null 2>&1 || UV="$(command -v uv || echo uv)"

failed=0
todo=()
say()  { printf '%s\n' "$*"; }
ok()   { say "  OK    $*"; }
warn() { say "  WARN  $*"; }
fail() { say "  FAIL  $*"; step_failed=1; }
act()  { say "  DO    $*"; }
would() { say "  TODO  $*"; todo+=("$*"); }
header() { say ""; say "== $1 =="; step_failed=0; }
done_step() { [ "$step_failed" -eq 0 ] || failed=$((failed + 1)); }

# --- pull -------------------------------------------------------------------
step_pull() {
    header "pull: fast-forward every checkout"
    local script="$ROOT/fwkt-webapps/pull-all-repos.sh"
    [ -f "$script" ] || { fail "$script not found"; return; }
    if [ "$APPLY" -eq 1 ]; then
        bash "$script" || warn "some checkouts were skipped (see above)"
    else
        bash "$script" --dry-run || warn "some checkouts would be skipped (see above)"
    fi
}

# --- deploy -----------------------------------------------------------------
# unit|checkout (relative to ROOT)|sync arguments. Order matters: the intake
# goes before the web app, so a restart of the web app drops no shot.
UNITS=(
    "labfrog-shot-intake|labfrog|sync --locked"
    "labfrog-shotsheet|labfrog|sync --locked"
    "labfrog-explorer|labfrog-sqlite-tools-repo|sync --locked"
    "simulationlogger|simulation_logger|sync --locked"
    "scicatplugin|scicat_plugin|sync --locked"
    "laser-shot-aligner|shot-aligner|sync --locked --no-default-groups"
    "planet-watchdog-shot-authority|planet-watchdog|sync --locked --group deploy"
    "planet-watchdog-master|planet-watchdog|sync --locked --group deploy"
    "damnit-api|DAMNIT-web-hzdr/api|sync --locked"
)

# When HEAD last moved in this checkout (a pull), as epoch seconds.
head_moved() {
    local dir="$1" t
    t="$(git -C "$dir" reflog -1 --format=%ct HEAD 2>/dev/null)"
    [ -n "$t" ] || t="$(git -C "$dir" log -1 --format=%ct 2>/dev/null)"
    printf '%s' "${t:-0}"
}

unit_started() {
    local ts
    ts="$(systemctl show -p ActiveEnterTimestamp --value "$1" 2>/dev/null)"
    [ -n "$ts" ] || { printf '0'; return; }
    date -d "$ts" +%s 2>/dev/null || printf '0'
}

step_deploy() {
    header "deploy: restart what runs older code than its checkout"
    local entry unit rel args dir moved started synced=" "
    local stale=()
    for entry in "${UNITS[@]}"; do
        IFS='|' read -r unit rel args <<<"$entry"
        dir="$ROOT/$rel"
        if ! systemctl cat "$unit" >/dev/null 2>&1; then
            warn "$unit: not installed"; continue
        fi
        [ -d "$dir" ] || { fail "$unit: checkout $dir missing"; continue; }
        moved="$(head_moved "$dir")"
        started="$(unit_started "$unit")"
        if [ "$started" -eq 0 ]; then
            warn "$unit: not running"; stale+=("$entry")
        elif [ "$moved" -gt "$started" ]; then
            say "  STALE $unit: started $(date -d "@$started" '+%F %H:%M'), checkout moved $(date -d "@$moved" '+%F %H:%M')"
            stale+=("$entry")
        else
            ok "$unit runs its checkout's code ($(git -C "$dir" rev-parse --short HEAD))"
        fi
    done
    [ ${#stale[@]} -gt 0 ] || return
    for entry in "${stale[@]}"; do
        IFS='|' read -r unit rel args <<<"$entry"
        dir="$ROOT/$rel"
        if [ "$APPLY" -eq 0 ]; then
            would "(cd $dir && $UV $args) then sudo systemctl restart $unit"
            continue
        fi
        if [[ "$synced" != *" $rel "* ]]; then
            act "$UV $args in $dir"
            # shellcheck disable=SC2086  # args is a word list on purpose
            if ! (cd "$dir" && "$UV" $args); then
                fail "$unit: sync failed in $dir; not restarted"; continue
            fi
            synced+="$rel "
        fi
        act "sudo systemctl restart $unit"
        if sudo systemctl restart "$unit"; then
            sleep 3
            if systemctl is-active --quiet "$unit"; then ok "$unit active"
            else fail "$unit not active: journalctl -u $unit -n 50"; fi
        else
            fail "$unit: restart failed"
        fi
    done
    step_frontend
}

# DAMNIT's frontend is a static build; it is stale when the checkout moved
# after the last build.
step_frontend() {
    local repo="$ROOT/DAMNIT-web-hzdr" dist built moved
    dist="$repo/frontend/apps/app/dist/index.html"
    [ -d "$repo/frontend" ] || return
    moved="$(head_moved "$repo")"
    built="$(stat -c %Y "$dist" 2>/dev/null || echo 0)"
    if [ "$built" -ge "$moved" ]; then
        ok "DAMNIT frontend built after the last pull"; return
    fi
    if [ "$APPLY" -eq 0 ]; then
        would "DAMNIT frontend: pnpm install --frozen-lockfile && pnpm --filter ./apps/app build"
        return
    fi
    act "building DAMNIT's frontend"
    if (cd "$repo/frontend" && pnpm install --frozen-lockfile && pnpm --filter ./apps/app build); then
        ok "frontend built"
    else
        fail "frontend build failed (the old build is still served)"
    fi
}

# --- tidy -------------------------------------------------------------------
exclude_locally() {
    local repo="$1" pattern="$2" why="$3" file
    file="$repo/.git/info/exclude"
    [ -d "$repo/.git" ] || { warn "$repo is not a checkout"; return; }
    if grep -qxF "$pattern" "$file" 2>/dev/null; then
        ok "$(basename "$repo"): $pattern already excluded locally"
    elif [ "$APPLY" -eq 1 ]; then
        printf '# %s\n%s\n' "$why" "$pattern" >>"$file"
        act "$(basename "$repo"): $pattern added to .git/info/exclude (this host only)"
    else
        would "$(basename "$repo"): add $pattern to .git/info/exclude ($why)"
    fi
}

step_tidy() {
    header "tidy: expected warnings and the rulings copy"
    exclude_locally "$ROOT/asapo-for-hzdr-damnit" ".env" \
        "ASAPO is off; its .gitignore misses .env (next-on-server, $STAMP)"
    exclude_locally "$ROOT/labfrog-sqlite-tools-repo" "retained_exports/" \
        "real data kept on purpose, not for git (next-on-server, $STAMP)"

    local copy="$HOME/2024_08_08.decisions.json.server"
    local tracked="$ROOT/shot-aligner/shot_aligner/index/2024_08_08.decisions.json"
    if [ ! -e "$copy" ]; then
        ok "no rulings copy left in ~ (already handled)"
    elif [ ! -f "$tracked" ]; then
        fail "$tracked missing: pull shot-aligner first (step pull)"
    elif cmp -s "$copy" "$tracked"; then
        local dest="$HOME/archive/cleanup-$(date +%F)"
        if [ "$APPLY" -eq 1 ]; then
            mkdir -p "$dest" && mv "$copy" "$dest/" && act "rulings copy matches; moved to $dest/"
        else
            would "rulings copy matches the committed file; move it to $dest/"
        fi
    else
        fail "the rulings copy differs from the committed file: compare by hand, keep both"
    fi
}

# --- rebuild ----------------------------------------------------------------
step_rebuild() {
    header "rebuild: DAMNIT campaigns, then the bridge-v6 check"
    local api="$ROOT/DAMNIT-web-hzdr/api" script
    script="$api/scripts/hzdr-rebuild.py"
    [ -f "$script" ] || { fail "$script missing: pull DAMNIT (step pull)"; return; }
    local extra=()
    [ "$ALL_CAMPAIGNS" -eq 1 ] && extra+=(--all-exports)
    if [ "$APPLY" -eq 0 ]; then
        (cd "$api" && "$UV" run --no-sync python scripts/hzdr-rebuild.py --print "${extra[@]}") \
            || warn "could not assemble the command"
        say "  check of the files as they are now:"
        if (cd "$api" && "$UV" run --no-sync python scripts/hzdr-rebuild.py --check-only); then
            ok "every campaign file has authority_shot_number"
        else
            would "rebuild (the files marked MISSING lack bridge v6)"
        fi
        return
    fi
    if ! systemctl is-active --quiet damnit-api; then
        fail "damnit-api is not active: run step deploy first"; return
    fi
    act "rebuilding (several minutes per campaign on the share)"
    local rc=0
    (cd "$api" && "$UV" run --no-sync python scripts/hzdr-rebuild.py "${extra[@]}") || rc=$?
    case "$rc" in
        0) ok "rebuilt; every campaign file has authority_shot_number" ;;
        1) fail "a campaign file still lacks the column; rerun with --all-campaigns for old campaigns" ;;
        *) fail "rebuild exited $rc (a held lock: see the operations guide, 'A build that never finishes')" ;;
    esac
}

# --- labfrog ----------------------------------------------------------------
step_labfrog() {
    header "labfrog: Beamtime Setup settings (values are not printed)"
    local inst="$ROOT/labfrog/instance" key found
    [ -d "$inst" ] || { fail "$inst missing"; return; }
    for key in WATCHDOG_COLLECTION DAMNIT_API_URL BEAMTIME_RULES_DIR SHOT_DETAILS_ZMQ_RUNNER DOCS_URL; do
        found="$(grep -lE "^[[:space:]]*$key[[:space:]]*=" "$inst"/*.cfg 2>/dev/null | xargs -r -n1 basename | paste -sd, -)"
        if [ -n "$found" ]; then ok "$key set in $found"
        else would "$key not set in instance/*.cfg (see next-on-server.md, Beamtime Setup)"; fi
    done
    # LabFrog 0.10.0 is the release with Beamtime Setup and the shot intake.
    local version
    version="$(sed -n 's/^version = "\(.*\)"/\1/p' "$ROOT/labfrog/pyproject.toml" 2>/dev/null | head -1)"
    case "$version" in
        0.[0-9]|0.[0-9].*|"") warn "LabFrog checkout is ${version:-unknown}, older than 0.10.0: run steps pull and deploy" ;;
        *) ok "LabFrog checkout is $version (labfrog-shotsheet runs it once step deploy reports it current)" ;;
    esac
    if curl -fsS -m 5 "$DAMNIT_URL/config/health" >/dev/null 2>&1; then
        ok "DAMNIT answers at $DAMNIT_URL/config/health (a value for DAMNIT_API_URL)"
    else
        warn "DAMNIT does not answer at $DAMNIT_URL/config/health"
    fi
}

# --- report -----------------------------------------------------------------
step_report() {
    header "report: checks and the deployed snapshot"
    if [ -d "$ROOT/labfrog" ]; then
        (cd "$ROOT/labfrog" && "$UV" run --no-sync poe check-shot-intake) \
            && ok "check-shot-intake passed" || fail "check-shot-intake failed (above)"
    fi
    local report="$ROOT/fwkt-webapps/server-report.sh"
    if [ -f "$report" ]; then
        local quick=(--quick)
        [ "$APPLY" -eq 1 ] && quick=()
        local out="$HOME/fwkt-report-$STAMP.txt"
        bash "$report" --out "$out" "${quick[@]}" >/dev/null 2>&1
        local fails=$?
        say "  $(grep -E 'PASS|WARN|FAIL' "$out" | tail -1)"
        if [ "$fails" -eq 0 ]; then ok "server-report: no FAIL ($out)"
        else fail "server-report: $fails FAIL ($out)"; fi
    else
        fail "$report not found"
    fi
    local deployed="$ROOT/fwkt-webapps/report-deployed.sh"
    if [ -f "$deployed" ]; then
        if [ "$APPLY" -eq 1 ]; then
            bash "$deployed" --out "$HOME/deployed-$STAMP.json" \
                && ok "snapshot ~/deployed-$STAMP.json: copy it to the combo root as deployed.json"
        else
            would "write ~/deployed-<time>.json with report-deployed.sh (with --apply)"
        fi
    fi
}

say "next-on-server: $( [ "$APPLY" -eq 1 ] && echo APPLY || echo 'look only (add --apply to do it)' ) on $(hostname), $(date '+%F %H:%M')"
for s in "${STEPS[@]}"; do
    "step_$s"
    done_step
done

say ""
if [ "$APPLY" -eq 0 ] && [ ${#todo[@]} -gt 0 ]; then
    say "${#todo[@]} thing(s) to do; run again with --apply. Then work through the"
    say "manual items in hzdr/docs/guides/next-on-server.md."
else
    say "Done. Manual items: hzdr/docs/guides/next-on-server.md."
fi
[ "$failed" -eq 0 ] || say "$failed step(s) ended in FAIL."
exit "$failed"
