# Shared Playwright drivers

`@damnit-frontend/testing` holds what more than one app's Playwright suite
uses. Each suite lives in the app it drives:

- `apps/app/tests/integration/` and `apps/app/tests/e2e/`, described in
  `apps/app/tests/README.md`
- `apps/site/tests/e2e/`
- `apps/demo/tests/e2e/`

Import a file by its name, as `@damnit-frontend/testing/playwright/table`.

## Files

- `playwright/base.ts`: `baseConfig`, the settings every suite's config
  spreads, and `isCI`.
- `playwright/production.ts`: the `test` and `expect` of the suites that run
  a production build with nothing intercepted: site, demo and the app's e2e
  suite. Its auto-used fixture fails a test on any console error, uncaught
  page error, or request to another host.
- `playwright/table.ts`, `grid.ts`, `plots.ts`, `dashboard.ts` and
  `context-file.ts`: driver and assertion helpers that take `page`, one file
  per feature.

The drivers know no example's data. A helper that reads an example, such as
`columnOf`, lives in the suite that owns the example.

## Installing the browser

From the `frontend/` root, once:

```
pnpm playwright:install
```

## Asserting on the table

The run table draws on a `<canvas>` (`@glideapps/glide-data-grid`), and the
grid also renders a hidden accessibility mirror, a `<table role="grid">` with
one cell per value on screen. Read cells, headers and the row count through the
helpers in `playwright/table.ts`, such as `cell`, `columnCells`, `columnTitles`
and `expectRunRows`. The mirror holds only the rows and columns in view.
Hovering, right-clicking and selecting need real mouse events on the canvas,
which `hoverCell`, `rightClickCell` and `selectRun` send.
