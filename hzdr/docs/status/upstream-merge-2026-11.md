# Upstream merge 2026-11 — status and remaining work

Branch: `upgrade/upstream-2026-11` (fork `main` + European-XFEL/DAMNIT-web
`main` as of 2026-11-03; 694 upstream commits since the 2026-07-07 sync).
Not yet opened as a PR.

## Done

- Merge commit with all 31 conflicts resolved (see its message for each
  resolution); `uv.lock` and `frontend/pnpm-lock.yaml` regenerated.
- `db.py` changes ported to upstream's `runs/sqlite/{session,repository}.py`.
- LDAP login form, saved-views popover (now in the table toolbar), API-docs
  user-menu item, fork footer links and HZDR home route carried over to
  upstream's new frontend layout.
- `metadata/__init__.py` no longer imports `gql` eagerly (circular import with
  upstream's `auth.permissions`).
- `tests/conftest.py` restores the event loop a test's `asyncio.run()` unsets
  (upstream's `test_db.py` broke 45 fork pytest-asyncio tests).
- Coverage map (`scripts/docs/refresh_coverage_map.py`) updated for `runs/`,
  `auth/permissions.py`, `test_errors.py`.
- `User.from_oauth_user` gives a user no proposal memberships when no MyMdC
  client is configured (HZDR LDAP + Mongo, no `DW_API_DAMNIT_PATH`), so
  upstream's new `IsProposalMember` answers "forbidden" instead of
  "Could not verify proposal access". Test in `tests/test_auth_modes.py`.

API suite run the way CI runs it (no `api/.env`, OIDC env vars):
**884 passed, 8 failed, 32 skipped.**

- Upstream's MyMdC/OIDC parity tests run against the fork's settings
  (mymdc provider + OIDC selected in their fixtures; optional MyMdC
  dependency honours test overrides; OIDC login test skips without OIDC).
- Frontend: HZDR app passes upstream's stricter ESLint config
  (`--max-warnings 0`); prettier and tsc clean across the workspace.

Results:
- API, run the way CI runs it: **892 passed, 32 skipped**, coverage 86%,
  ruff check + format clean. With the local HZDR `api/.env`: 891 passed,
  1 skipped (OIDC login), 32 skipped.
- Frontend: `apps/app` 135/135; `packages/ui` 587/587 (browser tests run
  locally with `launchOptions.executablePath` pointed at the container's
  Chromium, since upstream pins Playwright 1.64; CI installs its own).

- Upstream's character check passes over the whole tree (fork-owned HZDR
  paths and byte-pinned vendored files/fixtures are `-check-characters`).
- Docs build with zensical (`api/zensical.toml`); `CLAUDE.md` updated.
- Upstream's e2e suite (142 tests) against the HZDR app: 137 pass. It caught
  the HZDR header losing its user menu/Logout (upstream's `Header` is now
  presentational), now fixed. The 4 table tests left (resize past the last
  column, scrollbar drag) could not start a browser in the dev container
  (they need Playwright 1.64's headless shell); CI installs it.
- `main` merged in through #28.

## Remaining (after merge)

1. Watch the first CI run on the PR, especially the e2e job's 4 table tests.
2. Deploy on fwkt-webapps: `git pull --ff-only`, `uv sync --locked` in
   `api/`, `pnpm install --frozen-lockfile` and the app build in `frontend/`,
   restart `damnit-api`. The pnpm version is now 10.34.6 (`corepack enable`).
3. `hzdr/scripts/test-all.ps1` for the sibling conformance suites.
