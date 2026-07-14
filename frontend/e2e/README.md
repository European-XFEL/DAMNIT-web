# Frontend e2e tests

Playwright tests that drive the `@damnit-frontend/app` against a fully mocked
backend. No live API, database, or auth server is needed: the browser
intercepts every request and answers it from local data.

## Running

From the `frontend/` root:

```
pnpm e2e:setup   # once: install the Chromium browser
pnpm e2e         # run the suite
pnpm e2e:ui      # run in Playwright's watch UI
pnpm e2e:report  # open the last HTML report
```

Playwright starts the app on a dedicated port (6173). Locally it runs the dev
server; in CI it serves the production `preview` build (a `Build app` step runs
`vite build` first).

## Layout

- `tests/<project>/` - specs for one app, a Playwright **project** (`app`
  now, `site` later), defined in `playwright.config.ts`. Under a project,
  specs live in **domain folders** grouped by the capability a user exercises,
  so a newcomer finds a test by asking "what can a user do here" and reading
  the behavioral filename:

  ```
  tests/app/
    auth/           login, logout
    proposals/      browse and open a proposal (home)
    dashboard/      the workspace frame and navigation between views
    table/          the run table: cells, columns, tags, run detail, tooltips
    plots/          data plots, the plot dialog, summary plots
    live-updates/   live pushes over the websocket
    context-file/   the context file editor
    pages/          standalone routes with no real capability (not-found)
  ```

  A spec's folder follows the capability it tests, not where the code lives or
  which driver it imports. `dashboard/` owns the frame and the navigation
  between destinations; each capability folder owns the behavior at a
  destination.

- `fixtures/` - Playwright harness glue (`test.extend`). `index.ts` exports the
  extended `test` and `expect` and installs the auto-used `api` fixture.
- `mocks/` - the network layer, mirroring the app's API. `index.ts` is the
  route table the `api` fixture installs (auth, GraphQL, context file); it
  splits into `graphql.ts` / `auth.ts` / `contextfile.ts` as it grows.
- `support/` - imported driver and assertion helpers that take `page`, one
  file per feature (mirrors `features/`), e.g. `support/table.ts`. Added when
  the first spec needs one.
- `examples/` - static wire responses per example (`examples/xpcs/`). The runs
  and context file are read straight from the demo's `examples/`, so the mocks
  cannot drift from the demo.

Specs and fixtures import these through Node subpath aliases declared in
`package.json` `imports` (`#fixtures`, `#mocks`, `#examples/<example>`) rather
than relative `../../` paths.

## How the mocking works

The `api` fixture is auto-used, so every test gets the mock router before its
first navigation. The router answers auth, GraphQL, and context-file requests
from the active example, and accepts the graphql-ws socket without replying.

Any GraphQL operation or REST endpoint the router has no mock for is recorded
and fails the test in teardown, so mock drift surfaces loudly instead of as an
empty response or a silent request to the real network.

## Asserting on the table

The run table renders on a `<canvas>` (`@glideapps/glide-data-grid`), so its
cells are not in the DOM and cannot be queried by role or text. Assert on the
surrounding DOM (header, dialogs, popovers) or wait on the table-data response,
as `open-proposal.spec.ts` does.
