---
date: 2026-07-07
---

# ADR-003 - Settings: Injected Configuration, No Import-Time Singleton

## Context and Problem Statement

Configuration (auth credentials, database paths, MyMdC endpoints, local-mode selection) must be available throughout the application. There are two ways to provide it: a module-level singleton importable from anywhere, or an object constructed once and passed explicitly.

An import-time singleton has structural costs. Importing any module transitively requires a valid environment. Validation errors then fire at import, which breaks tooling, tests, and scripting contexts that never run the app. Configuration access is invisible in signatures, so nothing documents what depends on what. The application factory cannot be called twice with different configurations in one process, which blocks table-driven app tests. Modules dodge import-time failures with function-body imports, which then ossify into circular-import workarounds.

## Considered Options

- Keep the module-level `settings = Settings()` singleton, imported wherever configuration is needed
- Settings models only in `settings.py`; one instance constructed at the entrypoint and threaded explicitly through the composition root

## Decision Outcome

Chosen option: settings models only, constructed once at the entrypoint and injected, because it makes configuration dependencies visible in signatures, keeps imports environment-free, and allows multiple differently-configured app instances in one process.

### Consequences

- Good: tests build `Settings(...)` directly (pydantic-settings accepts init kwargs) and get components wired for that config - no env patching, no module reloads.
- Good: mode-dependent behaviour is forced up to the composition root, because nothing deeper can consult configuration without it showing up in a signature.
- Bad: signatures grow explicit parameters; that visibility is the point, but it is more ceremony than importing a global.

## Details

### The rules

1. `settings.py` defines models only (`Settings` and its nested models). The target state has no module-level instance.
2. `Settings` is constructed exactly once, at the entrypoint, and passed into the composition root. The composition root threads it into factories; everything else receives either the settings object or - preferably - the specific values it needs as plain parameters.
3. Environment handling: `DW_API_` prefix, `__` nested delimiter, `.env` support. Local mode is a derived property read only in the composition root.
4. Defaults must be production-safe: no paths into `tests/`, no writes into the source tree. Development conveniences belong in `.env` files and documentation, not in field defaults.
5. Verification: the `settings` instance is imported only by the composition root and tests; importing any other module with a bare environment succeeds.
