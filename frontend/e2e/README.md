# Frontend e2e tests

Playwright tests for the three frontend apps. The app suite drives
`@damnit-frontend/app` against a fully mocked backend. No live API, database,
or auth server is needed: the browser intercepts every request and answers it
from local data. The site and demo suites run the production builds of
`@damnit-frontend/site` and `@damnit-frontend/demo` with nothing intercepted,
so a change in the shared `packages/ui` that breaks either one fails a check.

## Running

From the `frontend/` root:

```
pnpm e2e:setup   # once: install the Chromium browser
pnpm e2e         # run the app suite
pnpm e2e:site    # run the site suite
pnpm e2e:demo    # run the demo suite
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

- `tests/<project>/` - specs for one app, a Playwright **project**: `app` in
  `playwright.config.ts`, `site` in `playwright.site.config.ts` and `demo` in
  `playwright.demo.config.ts`. Settings all three share live in
  `playwright.base.ts`. Under the app project, specs live in **domain
  folders** grouped by the capability a user exercises, so a newcomer finds a
  test by asking "what can a user do here" and reading the behavioral
  filename:

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
  `production.ts` does the same for the site and demo suites, with the error
  check described below instead of any mocks.
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

## Asserting on the table

The run table renders on a `<canvas>` (`@glideapps/glide-data-grid`), so its
cells are not in the DOM and cannot be queried by role or text. Assert on the
surrounding DOM (header, dialogs, popovers) or wait on the table-data response,
as `open-proposal.spec.ts` does.
