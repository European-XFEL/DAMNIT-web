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

## Remaining

1. **Character check** (new upstream pre-commit hook and CI job): run
   `uv run python scripts/check-characters/check_characters.py` over the
   tree; vendored `hzdr_packs/vendor/` and `hzdr-reference/` may need
   `-check-characters` in `.gitattributes`.
2. **CI workflows**: compare upstream's `.github/workflows` changes
   (docs via zensical, character check, e2e) with the fork's.
3. **Docs**: build with `uv run --group docs zensical build` in `api/`;
   update `CLAUDE.md` (mentions `db.py`/`data.py`, `api/mkdocs.yml`).
4. **Smoke test** the whole stack (`hzdr/scripts/hzdr-launch.sh`) and the
   HZDR pages in a browser; `hzdr/scripts/test-all.ps1` for sibling suites.
5. Open the PR to fork `main`.
