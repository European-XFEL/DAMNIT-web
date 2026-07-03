# Frontend e2e tests

Playwright tests that drive the `@damnit-frontend/app` against a fully mocked
backend. No live API, database, or auth server is needed: the browser
intercepts every request and answers it from local data.

## Running

```
pnpm --filter @damnit-frontend/e2e test:e2e
```

Playwright starts the app on a dedicated port (5190). Install the browser once
with `pnpm exec playwright install chromium`.

## Layout

- `tests/<surface>/` - specs, one folder per app surface (`app`, later
  `site`). Each surface is its own Playwright project in
  `playwright.config.ts`.
- `fixtures/` - Playwright fixtures (`test.extend`). `index.ts` exports the
  extended `test` and `expect`; `mock-api.ts` is the route table the `api`
  fixture installs.
- `examples/` - static wire responses per example (`examples/xpcs/`). The runs
  and context file are read straight from the demo's `examples/`, so the mocks
  cannot drift from the demo.

Specs and fixtures import these through Node subpath aliases declared in
`package.json` `imports` (`#fixtures`, `#examples/<example>`) rather than relative
`../../` paths.

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
