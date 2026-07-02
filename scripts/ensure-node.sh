# Source this script to ensure node and pnpm are available for frontend hooks.
# Auto-loads nvm when the current PATH cannot run the frontend toolchain.

_have_working_node_pnpm() {
    command -v node >/dev/null 2>&1 && \
        command -v pnpm >/dev/null 2>&1 && \
        pnpm --version >/dev/null 2>&1
}

if ! _have_working_node_pnpm; then
    _nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    if [ -s "$_nvm_sh" ]; then
        . "$_nvm_sh"
        nvm use --silent 2>/dev/null || true
    fi
    unset _nvm_sh

    if ! _have_working_node_pnpm; then
        echo >&2 "node/pnpm not found in this shell. Run 'nvm use' in the repo root, or install Node >= 24 and run 'corepack enable'."
        unset -f _have_working_node_pnpm
        exit 1
    fi
fi

unset -f _have_working_node_pnpm
