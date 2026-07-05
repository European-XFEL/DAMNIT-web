# Upstreaming plan: HZDR components → XFEL DAMNIT-web

Status: proposal (2026-07-05). Companion to [PR_NOTES.md](../PR_NOTES.md), which is an
earlier single-PR draft; this plan supersedes it with a split-PR strategy.

## 1. Baseline and divergence

The fork's last common upstream commit is `3f38e60`
(*feat(frontend/context-file): persist Monaco editor view state (#205)*). Everything
after that is HZDR work:

- **188 files changed** vs that base: **130 added, 58 modified**, ~35.8k insertions.
- Additions are mostly self-contained (`api/.../metadata/hzdr_*`, `api/.../consumer/`,
  `frontend/apps/app/src/hzdr/`, `api/scripts/hzdr-*`, `docs/`, tests).
- The sensitive part is the **58 modified upstream files** — that is what an upstream
  PR series has to keep small and reviewable.

Upstream `main` is currently at `89bc7e9`
(*ci(frontend): add lint and test workflow (#213)*), i.e. eight merged PRs ahead of
the fork point. Every PR below is cut against `upstream/main`, not against this
fork's `main`. Two consequences of #213 specifically:

- Upstream CI now runs frontend lint and unit/browser tests on PRs, so PR 2–4's
  frontend changes (`login-route.tsx`, `table.tsx`, `saved-views-popover.tsx`) must
  pass upstream's own workflow, not just the fork's local lint.
- The fork independently added `frontend/apps/app/vitest.config.ts` and
  `src/test-setup.ts` for the HZDR component tests. If #213 (or the commits behind
  it) introduced its own vitest/test scaffolding, expect a conflict there when
  merging upstream into the fork — reconcile toward upstream's config and port the
  HZDR test setup onto it.

Before Phase 1, enumerate the remaining #206–#212 commits
(`git log --oneline 3f38e60..upstream/main`) and merge or rebase fork `main` onto
`upstream/main` so the disentanglement refactors happen on a current base.

## 2. Inventory of HZDR changes

### A. Upstream candidates — generic, config-gated, separable

| Component | Files | Notes |
| --- | --- | --- |
| **LDAP auth backend** | `auth/ldap.py` (new, 129 lines), small touches in `auth/{__init__,bootstrap,dependencies,models,routers}.py`, `LDAPSettings` in `shared/settings.py`, LDAP form in `packages/ui/src/routes/login-route.tsx` | Fully config-gated (`DW_API_AUTH__MODE=ldap`), default off. Useful to any facility without OIDC. Cleanest first PR. Tests: `test_auth_modes.py`. |
| **Runtime config endpoint + terminology** | `shared/routers.py` (`GET /config/runtime`, `GET /config/health`), `DeploymentSettings`/`TerminologySettings` | Generic mechanism (a deployment can label "Proposal" vs "Source", advertise auth mode to the frontend). **Defaults must be flipped back to EXFEL behavior before upstreaming** — the fork currently defaults `profile="hzdr"`, `uses_proposals=False`, `provider="local"`. |
| **Saved table views** | `packages/ui/.../saved-views-popover.tsx` (new), 2-line hook in `table.tsx`, `GET/POST/DELETE /metadata/.../views` routes + sidecar persistence | Generic feature; the 2-line integration into upstream's `table.tsx` is ideal. Needs a storage decision with upstream (fork uses a `.views.json` sidecar next to the catalog; upstream may prefer their DB). Rename `hzdr_saved_views*` → `saved_views*` when extracting. |
| **Run-without-MyMdC / metadata provider switch** | `MetadataSettings.provider` (`local`/`mongo`/`mymdc`), `DamnitSettings.paths_by_proposal`, conditional `_mymdc.bootstrap` in `main.py`, `data.py`/`db.py` normalization-compat changes | Architecturally the most valuable to other facilities, but opinionated — propose via an upstream issue/discussion **before** writing the PR. |
| **Small fixes** | `_logging.py` (1 line), `graphql/models.py` (+3), `graphql/queries.py` (2), `metadata/gql.py` (+3), API root `/` → `/docs` redirect in `main.py` | Bundle as one tiny "misc fixes" PR, or fold each into the PR that touches the same area. Verify each is a real fix, not an HZDR accommodation. |

### B. Fork-only — HZDR-specific, do not propose upstream

- `metadata/hzdr_event.py`, `hzdr_nexus.py`, `hzdr_sources.py`, `labfrog_sqlite.py`,
  `producer_status.py`, `shared/flow_activity.py`
- `consumer/` (ASAPO/Kafka durable spool consumers) and their `main.py` lifespan wiring
- The ~1,200 added lines of `/metadata/hzdr/*` routes in `metadata/routers.py`
- All of `frontend/apps/app/src/hzdr/` (pages, components, utils, tests)
- `api/scripts/hzdr-*`, launchers (`scripts/hzdr-launch.*`), `.env.*.example` profiles,
  HZDR docs, examples, fixtures, `CLAUDE.md`/`AGENTS.md`/`PR_NOTES.md`
- HZDR-flavored parts of `contextfile/routers.py` (+425 lines): the per-user
  context-workspace endpoints run against `HZDRShot`/`HZDRSourceProvider`. The
  *concept* (per-user, per-source context files with `/results` execution) may
  interest upstream later, but the implementation is coupled to HZDR shots —
  raise as a discussion, not a PR, for now.

### C. Entangled — refactor in the fork before any PR can be cut

These upstream files currently mix generic and HZDR changes in one diff:

1. **`metadata/routers.py`** (+1,316 lines): HZDR endpoints are interleaved into the
   upstream router module. Move everything HZDR into a new `metadata/hzdr_routers.py`
   (or an `hzdr/` subpackage) with its own `APIRouter`, mounted from `main.py`.
   Upstream file returns to ~its original content plus the generic views routes.
2. **`main.py`** (+63/-?): three unrelated changes coexist — conditional mymdc
   bootstrap (belongs to the provider PR), auth-router selection change
   (`settings.is_local` → `auth.is_disabled`, belongs to the LDAP PR), and HZDR spool
   consumer startup/shutdown (fork-only; extract into e.g. `consumer.bootstrap(app,
   settings)` so the fork's `main.py` diff shrinks to one hook line).
3. **`shared/settings.py`** (+418 lines): split generic settings (`LDAPSettings`,
   `DamnitSettings`, `MetadataSettings`, terminology) from HZDR-only ones
   (`hzdr_spool`, `hzdr_kafka_spool`, flow-monitor receivers), and restore
   EXFEL-preserving defaults on anything upstreamed.
4. **`frontend/apps/app/src/app.tsx`** (+66): HZDR routes, `AppHeader` replacement,
   and `HeroPage` → `/home` redirect are fork-only. Isolate the HZDR route block
   (e.g. `hzdr/routes.tsx` exporting a fragment) so the fork's `app.tsx` diff is a
   few lines. The upstream PRs do not touch `app.tsx` at all.
5. **`login-route.tsx`** (fully rewritten): keep, but re-verify the OIDC path is
   byte-for-byte behavior-identical when `ldap_form_enabled` is false — the reviewer
   will ask.

## 3. Proposed PR series (smallest first, each independent)

0. **Upstream issue/discussion** introducing the fork, linking this plan's summary,
   and asking two questions: (a) interest in LDAP + runtime-config + saved views,
   (b) appetite for the metadata-provider abstraction and, longer-term, a
   facility-extension mechanism (which would let the whole `hzdr/` tree live as a
   plugin instead of a fork).
1. **PR 1 — misc small fixes** (`_logging`, graphql tweaks, root→`/docs` redirect).
   Trivial review, establishes the contribution relationship.
2. **PR 2 — `GET /config/runtime` + `GET /config/health` + terminology settings.**
   Defaults: `uses_proposals=true`, EXFEL labels. Frontend consumes nothing yet;
   pure additive API.
3. **PR 3 — LDAP auth backend** (API + login form). Depends on PR 2 (form is gated
   on runtime config). Includes `test_auth_modes.py`, docs for the `DW_API_AUTH__*`
   knobs, and the `is_local` → `auth.is_disabled` router-selection change with its
   rationale.
4. **PR 4 — saved table views** (popover + routes + persistence), after agreeing
   storage with upstream. All `hzdr_` prefixes renamed out.
5. **PR 5 — metadata provider / run-without-MyMdC**, only if the discussion in
   step 0 lands positively. Largest and most architectural; keep `mymdc` the default
   provider upstream.

Each PR: cut from `upstream/main`, conventional-commit style matching upstream
history (`feat(api): …`, `fix(frontend): …`), tests + docs included, target well
under ~500 changed lines, no behavior change for a default EXFEL deployment.

## 4. Work order in this fork

1. **Phase 0 — sync with upstream:** upstream/main is at `89bc7e9` (#213). Review
   the #206–#213 commits, then merge or rebase fork `main` onto `upstream/main` so
   the refactors below happen on a current base. Watch for the vitest-config
   conflict noted in §1.
2. **Phase 1 — disentangle (no behavior change, characterization tests first per
   repo convention):** items C1–C4 above. Validate each step with
   `uv run pytest`, `uv run ruff check .`, `pnpm run lint`,
   `python api/scripts/hzdr-local-acceptance.py`, and `pwsh scripts/test-all.ps1`
   before the cross-repo-sensitive moves (the `hzdr_event.py` contract file must not
   move or change — it is vendored byte-identically into sibling repos).
3. **Phase 2 — extract PR branches:** for each PR in §3, cherry-pick/re-implement
   onto `upstream/main` in a fresh branch; flip defaults back to EXFEL; strip HZDR
   naming; run upstream's own CI workflows locally where possible.
4. **Phase 3 — converge:** as PRs merge, rebase the fork onto upstream/main and drop
   the now-duplicated commits, shrinking the permanent fork delta to bucket B only.

## 5. Open questions for upstream maintainers

- Saved-views persistence: sidecar JSON next to the data vs. their SQLAlchemy DB?
- Is `auth.is_disabled` (explicit no-auth mode) acceptable as a replacement for the
  `settings.is_local` heuristic?
- Any interest in a general "deployment profile / facility extension" mechanism that
  would let route bundles and header/branding be injected without patching `app.tsx`?
- Where should the LDAP dependency (`ldap3~=2.9`, currently a hard dependency in
  `api/pyproject.toml`) sit: hard dependency or optional extra (`damnit-api[ldap]`)?
  The imports in `auth/ldap.py` are already function-local, so an extra is cheap.
