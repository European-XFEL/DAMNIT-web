# Source this script to ensure pnpm is available for frontend hooks.
# Auto-loads nvm when pnpm is not already in PATH.

if ! command -v pnpm &>/dev/null; then
    _nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    if [ -s "$_nvm_sh" ]; then
        . "$_nvm_sh"
        nvm use --silent 2>/dev/null || true
    fi
    unset _nvm_sh

    if ! command -v pnpm &>/dev/null; then
        echo >&2 "pnpm not found. Run 'nvm use' in the repo root, or install Node >= 24 and run 'corepack enable'."
        exit 1
    fi
fi
