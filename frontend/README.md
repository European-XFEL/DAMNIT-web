# DAMNIT - Web client

This is a prototype web client for DAMNIT.

## Description

The application enables visualization and interaction with the DAMNIT table.

### Technologies

- React (web framework)
- Redux (global storage)
- Apollo Client (GraphQL client)
- Mantine UI (styled components)
- Glide Data Grid (table component)
- Plotly.js (plotting library)
- Vite (build tool)
- Vitest (testing)

### Architecture

`packages/ui` holds the product; the apps are thin shells around it. The tree is
layered, and ESLint enforces the layering, so a mistake fails lint rather than
review:

```
packages/ui/src/
  app/          wiring: providers, routes, pages, store (the only layer that
                knows everything)
  features/     auth, context-file, dashboard, plots, proposals, table
  components/   presentational only: no store, auth, or Apollo
  graphql/      Apollo client, shared documents, operation names
  lib/  utils/  styles/   shared leaves
  data/         the table slice and the proposal queries: the server state
                still held outside Apollo
```

Imports run one way: `components / lib / utils / graphql` <- `features` <-
`app`. Two rules are worth knowing before you write an import:

- **Features do not import each other.** The single exception is `dashboard`,
  which is the workspace composite: it may compose `table`, `plots`,
  `context-file`, and `auth`. That exception is enumerated in the boundaries
  config; leaf-to-leaf stays banned. Cross-feature reactions belong in
  `app/store/listeners.ts`, next to the existing ones.
- **A feature may only reach the store's typed surface**
  (`app/store/hooks|selectors|thunks|actions|types`), never the reducer
  assembly or the store itself. Read another feature's state through the
  selectors it exports, never with an inline `useAppSelector((s) => s.other)`:
  ESLint sees imports, not state reads, so that one is on you.

Imports outside a file's own folder use the `#src/*` subpath import
(`#src/utils/array`), never `../`. Same-folder imports stay relative (`./`).
That keeps a file's imports stable when the tree moves, and it is enforced.

### Data flow

Every GraphQL fetch goes through an Apollo hook, and the Apollo cache is the
render source. `DamnitRun` carries an identity trio (`database`, `proposal`,
`run`) and the cache keys it on all three, since run numbers collide across
proposals in one file (`typePolicies` in `graphql/type-policies.ts`).

- **Table rows and summary plots** render from the cache. The row layout is the
  server-ordered `metadata.runs`; a cell's value is looked up by the run's
  identity. `useTableRuns` owns one watched lightweight query and `fetchMore`s
  the pages the user scrolls to; the `Query.runs` field policy (`keyArgs`
  `['database']`) dedups every page, deferred fill, and pushed run into one
  list. The heavy pass still runs: after a page lands, its blanked heavy values
  are refetched (`network-only`, throttled by the priority link) and merge into
  the same runs. The `DamnitRun.cells` field policy (`keyArgs: false`) merges
  the lightweight, deferred, and pushed cell sets into one bag per run, keyed by
  name; a held-back blank (an errorless null) never overwrites a value already
  in place.
- **Preview plots** render straight from the Apollo cache. `extracted_data`
  fetches one run per call and has no batch field, so `usePreviewPlotData`
  builds a document that aliases the field per run (`r142:
  extracted_data(run: 142, ...)`), chunked by run value. One
  `PreviewChunkLoader` per chunk fetches
  cache-and-network, while the parent watches the whole aliased document
  cache-only with `returnPartialData`, so the plot fills in as chunks land.

Liveness comes from the cache. The `run_updates` subscription (`use-proposal`)
writes changed runs into the normalized cache and, when the run list, variables,
or tags change, replaces the `TableMeta` entry; the `since` cursor advances with
each push. Leaving a proposal drops its cached fields and collects the runs they
referenced (`app/store/listeners.ts`), deferred until the departing page's
watchers have unsubscribed so the eviction cannot send them back to the network.
There is no stale-proposal guard: the three-part key makes a departed proposal's
runs unreadable by the next one.

## Installation

Clone the project and run the following on the root folder:

```sh
pnpm install
```

## Usage

After the installation, start the app with a development server:

```sh
pnpm run dev:app
```

and navigate to `localhost:5173` on your favorite browser.

You might need to supply a couple of environment variables to connect to a
running web server. Add an `.env` file on `apps/app` with the following:

```ini
# .env
VITE_API = "http://127.0.0.1:30200"
```

## Testing

Tests live in `packages/ui/tests`. The file extension decides where a test
runs, and that is the only rule to remember:

- `*.test.ts` runs in Node. Use it for pure logic (functions, reducers,
  selectors). Fast, no DOM.
- `*.test.tsx` runs in a real browser (Chromium). Use it for anything that
  renders or touches the DOM (components, hooks). If it needs a DOM, name it
  `.tsx`.

Run the suite from the `frontend` folder:

```sh
pnpm test           # everything
pnpm test:node      # just the Node logic tests
pnpm test:browser   # just the browser tests
```

Shared test helpers (the render wrapper, the Node setup) live in
`packages/ui/tests/support` and are imported via `#tests/support/...`.

## Deployment

Deployments are done on DMZ hosts, which server static files via nginx running in a docker container managed via compose.

The repository should be checked out under `/data/srv/damnit-web/{test,prod}`, the host is `exfldamnittest01.desy.de` for test and `exfldamnitprod01.desy.de` for prod.

Docker compose is used to manage the service, with files for the deployment `compose.{test,prod}.yml`. Select the file with the `-f` flag in docker compose:

```sh
# To bring up test w/ a build:
docker compose -f compose.test.yml up --build

# Same for prod:
docker compose -f compose.prod.yml up --build
```

The compose project will be named `damnit-web-{test,prod}`, which can then be used to manage the service:

```sh
# Then standard compose commands with the project, e.g.
docker compose -p damnit-web-test {ps,logs,up,down,etc...}
```

Don't forget to add some environment on the variables on the monorepo by creating an `.env` file on the root repo with the following:

```ini
# .env
SITE_PREVIEW_PORT=4174
APP_PREVIEW_PORT=4173
APP_BASE_PATH="/"
API_URL="http://127.0.0.1:30200"
```

### Certificates

Certificates are managed via `getssl` script as per DESY's documentation, see the [DESY CA Documentation](https://www-ca.desy.de/acme/index_ger.html) and [getssl documentation](https://github.com/srvrco/getssl) for details. Key parts of the configuration are:

```env
# ~/.getssl/damnit-test.xfel.eu/getssl.cfg
# Include current host name as SAN
SANS="exfldamnittest01.desy.de"

# Certs for test:
DOMAIN_CERT_LOCATION="/data/certs/damnit-test.xfel.eu.pem"
DOMAIN_KEY_LOCATION="/data/certs/damnit-test.xfel.eu.key"
CA_CERT_LOCATION="/data/certs/damnit-test.xfel.eu-chain.pem"

# Restart test project so it uses new certs:
RELOAD_CMD="docker compose -p dw-test restart frontend"
```

With a similar config for prod.

The following crontab entry is used to check/refresh the certificates, which runs once a week:

```crontab
0 0 * * 0 root /root/.getssl/bin/getssl -u -a -q | logger -e -s -t getssl
```
