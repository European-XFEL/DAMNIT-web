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

## Remaining

1. **Upstream parity tests that assume XFEL's MyMdC** — 6 failures in
   `api/tests/refactor/e2e/` (auth surface, authz member, data parity) and
   2 in `api/tests/shared/test_gql.py` (MyMdC handshake retry). Cause: the
   fork's `main.py` bootstraps MyMdC only when
   `DW_API_METADATA__PROVIDER=mymdc`; upstream always does, and these tests
   force a mock MyMdC but leave the provider at its default. Likely fix: set
   the provider to `mymdc` in those tests' fixtures (they test XFEL
   behaviour), or bootstrap MyMdC whenever `settings.mymdc` is a mock. Check
   `test_login_redirects_to_oidc_provider_unchanged` (307 vs 302) and the
   userinfo shape separately — may be a genuine fork/upstream difference.
2. **Frontend** — not yet built or tested after the merge:
   `pnpm run lint:eslint`, `lint:prettier`, `lint:tsc`, `pnpm test` from
   `frontend/`. Expect fixes in `apps/app` (HZDR pages) against upstream's
   new `@damnit-frontend/ui` exports, the HZDR app's move to vitest 4, and
   upstream's ESLint layering rules (`#src/*` imports) in `packages/ui`
   (ported `saved-views-popover.tsx`, `login-route.tsx`).
3. **Pre-commit / CI**: run `uv run python scripts/check-characters/check_characters.py`
   over the tree (new upstream hook); vendored `hzdr_packs/vendor/` and
   `hzdr-reference/` may need `-check-characters` in `.gitattributes`.
   Check `.github/workflows` for upstream's docs build (zensical) vs the
   fork's workflows.
4. **Docs**: `api/zensical.toml` replaces `mkdocs.yml`; build with
   `uv run --group docs zensical build` in `api/` and fix the nav if
   `hzdr.md` or moved pages break it. `CLAUDE.md` still mentions
   `db.py`/`data.py` and "pyright paused" upstream context — update.
5. **Smoke test** the whole stack (`hzdr/scripts/hzdr-launch.sh`) and the
   HZDR pages in a browser; run `hzdr/scripts/test-all.ps1` for the sibling
   conformance suites.
6. Open the PR to fork `main`.
