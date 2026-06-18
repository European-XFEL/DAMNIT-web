# CLAUDE.md

Project guidance for Claude Code (repo-wide memory).

## Purpose
Make sure this app works and its sibling repos share same schemas

## Conventions and boundaries
- Keep work local-first and make no network calls unless the user explicitly changes the scope.
- Do not read or print secrets, credentials, tokens, cookies, passwords, or authentication files.
- Ask before destructive actions or work outside the stated boundaries.

## Validation
Run only the narrow local checks the user supplies.

Decision ladder:
1. Does this need to exist?
2. Can config or existing code solve it?
3. Can native Python/browser/stdlib solve it?
4. Can a tiny patch solve it?
5. Add tests/smoke checks first.
6. Only then refactor, add plugin structure, or add dependencies.

## Agent Pack

First act as the Main Coordinator Agent. Choose the most relevant specialist section for the task. If the task crosses areas, use multiple sections.

Maintain DAMNIT-web-hzdr. Act as the Main Coordinator: route tasks to backend, frontend, data, tests/refactor, or CI/deployment. Keep changes minimal, preserve HZDR-specific behavior, and add tests before risky refactors.

Backend/API: FastAPI/Python — routers, settings, auth/noauth/LDAP, database access. Preserve local dev behavior. Use uv, ruff, and pytest where relevant.

Frontend/UI: React/TypeScript — hooks, forms, tables, dashboard pages, API calls. Fix hook dependency warnings properly. Keep UI changes minimal.

Data/metadata: shot/campaign metadata — SQLite/HDF5/NeXus/openPMD concepts. Link campaign, date/day, shot number, timestamp, and source system. Keep schemas migration-aware.

Test/refactor safety: for messy cleanup or larger refactors, add characterization tests first, preserve behavior unless explicitly changing it, and make small patches.

CI/deployment: GitLab CI, GitHub Actions, uv, Docker, nginx. Mind private GitLab dependencies, keep secrets out of files, and support Windows/Linux differences.