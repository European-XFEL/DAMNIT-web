# App browser tests

Playwright tests for `@damnit-frontend/app`, in two suites:

- `integration/` drives the app against a fully mocked backend. No live API,
  database, or auth server is needed: the browser intercepts every request
  and answers it from local data.
- `e2e/` runs the app's production build against the real API, which serves
  a mock proposal DAMNIT built. It has one spec per workflow, and the
  integration suite keeps each workflow's cases.

The drivers both suites share, and the grid's accessibility mirror they read,
are in `packages/testing/README.md`.

## Running

From the `frontend/` root:

```
pnpm playwright:install   # once: install the Chromium browser
pnpm integration          # run the integration suite
pnpm integration:ui       # run it in Playwright's watch UI
pnpm e2e:app              # run the e2e suite (see below for its one-time setup)
pnpm e2e:report           # open the report of the last run made with --reporter=html
```

The integration suite starts the app on a dedicated port (6173), from
`playwright.integration.config.ts`. Locally it runs the dev server; in CI it
serves the production `preview` build (a `Build app` step runs `vite build`
first). The e2e suite's config is `playwright.e2e.config.ts`. The app has no
default config, so a `playwright test` run by hand in `apps/app` needs `-c`
and one of the two files.

## Layout of the integration suite

Specs live in **domain folders** grouped by the capability a user exercises,
so a newcomer finds a test by asking "what can a user do here" and reading the
behavioral filename:

```
integration/
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

Beside the domain folders:

- `fixtures.ts`: exports the extended `test` and `expect` and installs the
  auto-used `api` fixture.
- `mocks/`: the network layer, mirroring the app's API. `index.ts` is the
  route table the `api` fixture installs (auth, GraphQL, context file).
- `support/`: helpers only this suite uses. `example.ts` holds the ones that
  read an example, such as `openProposal` and `columnOf`.
- `examples/`: static wire responses per example (`examples/xpcs/`). The runs
  and context file are read straight from the demo's `public/examples/`, so
  the mocks cannot drift from the demo.

Specs import these through the subpath alias `#tests/*`, declared in the
app's `package.json` `imports`, rather than relative `../../` paths.

## How the mocking works

The `api` fixture is auto-used, so every test gets the mock router before its
first navigation. The router answers auth, GraphQL, and context-file requests
from the active example, and accepts the graphql-ws socket without replying.

Any GraphQL operation or REST endpoint the router has no mock for is recorded
and fails the test in teardown, so mock drift surfaces loudly instead of as an
empty response or a silent request to the real network. So does any request to
another host, such as a CDN or an analytics script.

## The e2e suite

The suite starts two servers:

- the API in local mode, on 6177;
- the app's production build on 6176 at `/app/`, whose `vite preview` forwards
  the API's paths to the API.

Before the first run, install the API and DAMNIT from the repo root:

```
uv sync --all-packages --group damnit-backend
```

The API serves a copy of `api/tests/mock/proposals/all-value-types/`, as
`damnit-e2e-real-api-<user>/` in the system's temp folder. Its server replaces
the copy each time it starts, so the suite never writes to the one in git. The
last run's copy stays, for a look after a red run.

`live-updates.spec.ts` has DAMNIT extract a new run into the copy, which
changes every other spec's table. So the spec has the project
`e2e-app-live-chromium` to itself, which runs after every other spec.
