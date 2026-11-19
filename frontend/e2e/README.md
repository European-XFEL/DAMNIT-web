# Frontend e2e tests

Playwright tests for the three frontend apps, in four suites:

- `app` drives `@damnit-frontend/app` against a fully mocked backend. No
  live API, database, or auth server is needed: the browser intercepts every
  request and answers it from local data.
- `site` and `demo` run the production builds of `@damnit-frontend/site`
  and `@damnit-frontend/demo` with nothing intercepted, so a change in the
  shared `packages/ui` that breaks either one fails a check. The demo answers
  from its own MSW mocks.
- `stack` runs the production build of `@damnit-frontend/app` against the
  real API, which serves a mock proposal DAMNIT built. It has one spec per
  workflow, and the app suite keeps each workflow's cases.

## Running

From the `frontend/` root:

```
pnpm e2e:setup   # once: install the Chromium browser
pnpm e2e         # run the app suite
pnpm e2e:site    # run the site suite
pnpm e2e:demo    # run the demo suite
pnpm e2e:stack   # run the stack suite (see below for its one-time setup)
pnpm e2e:ui      # run the app suite in Playwright's watch UI
pnpm e2e:report  # open the last HTML report
```

Playwright starts the app on a dedicated port (6173). Locally it runs the dev
server; in CI it serves the production `preview` build (a `Build app` step runs
`vite build` first).

The site and demo suites always build their app first, which takes about a
minute, and then serve it with `vite preview`: the site on 6174 at `/`, the
demo on 6175 at `/demo/` as it is deployed.

## Layout

- `tests/<project>/` - specs for one suite, a Playwright **project**: `app` in
  `playwright.config.ts`, `site` in `playwright.site.config.ts`, `demo` in
  `playwright.demo.config.ts` and `stack` in `playwright.stack.config.ts`.
  Settings all four share live in `playwright.base.ts`. Under the app
  project, specs live in **domain folders** grouped by the capability a user
  exercises, so a newcomer finds a test by asking "what can a user do here"
  and reading the behavioral filename:

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
  `production.ts` does the same for the site, demo and stack suites, with the
  error check described below instead of any mocks.
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
`package.json` `imports` (`#fixtures`, `#fixtures/production`, `#mocks`,
`#examples/<example>`) rather than relative `../../` paths.

## How the mocking works

The `api` fixture is auto-used, so every test gets the mock router before its
first navigation. The router answers auth, GraphQL, and context-file requests
from the active example, and accepts the graphql-ws socket without replying.

Any GraphQL operation or REST endpoint the router has no mock for is recorded
and fails the test in teardown, so mock drift surfaces loudly instead of as an
empty response or a silent request to the real network. So does any request to
another host, such as a CDN or an analytics script.

## The site and demo suites

The demo answers its API calls from its own MSW mocks, which run in the page
and log any GraphQL operation or REST call they have no mock for.

The auto-used fixture in `fixtures/production.ts` fails a test on any console
error, uncaught page error, or request to another host. The demo's preview
server pins its base to `/demo/` apart from the build, so a demo built for the
wrong base 404s its own assets and fails every spec.

To route or watch the demo's requests to other sites, use `context`, not
`page`: the service worker sends them on itself, and only the context sees
them.

## The stack suite

The suite starts two servers:

- the API in local mode, on 6177;
- the app's production build on 6176 at `/app/`, whose `vite preview` forwards
  the API's paths to the API.

Before the first run, install the API and DAMNIT from the repo root:

```
uv sync --all-packages --group damnit-backend
```

The API serves a copy of `api/tests/mock/proposals/all-value-types/`, as
`damnit-e2e-stack-<user>/` in the system's temp folder. Its server replaces
the copy each time it starts, so the suite never writes to the one in git. The
last run's copy stays, for a look after a red run.

## Asserting on the table

The run table draws on a `<canvas>` (`@glideapps/glide-data-grid`), and the
grid also renders a hidden accessibility mirror, a `<table role="grid">` with
one cell per value on screen. Read cells, headers and the row count through the
helpers in `support/table.ts`, such as `cell`, `columnCells`, `columnTitles`
and `expectRunRows`. The mirror holds only the rows and columns in view.
Hovering, right-clicking and selecting need real mouse events on the canvas,
which `hoverCell`, `rightClickCell` and `selectRun` send.
