import { HttpResponse, graphql, http, ws } from 'msw'

import {
  HOME_PROPOSALS,
  HOME_SEMESTERS,
  MockDataNotFound,
  XPCS_USER,
  resolveOperation,
  type MockDataSource,
  type Runs,
} from '@damnit-frontend/shared/mocks'

// Not imported from @damnit-frontend/ui, which would load the app before
// mocking starts (see main.ts).
const BASE_URL = import.meta.env.BASE_URL

// Served from apps/demo/public in mock mode, see vite.config.ts.
const EXAMPLE_URL = `${BASE_URL}examples/xpcs`

const USER = { ...XPCS_USER, proposals_by_year_half: HOME_SEMESTERS }
const ACCESSIBLE = Object.values(HOME_SEMESTERS).flat()

async function fetchExample(path: string): Promise<Response> {
  const response = await fetch(`${EXAMPLE_URL}/${path}`)
  if (response.status === 404) {
    throw new MockDataNotFound()
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch "${path}" (${response.status})`)
  }
  return response
}

// Only 6996 has example data, so serve it for every proposal.
const source: MockDataSource = {
  runs: async () => (await fetchExample('runs.json')).json() as Promise<Runs>,
  extractedData: async ({ run, variable }) =>
    (await fetchExample(`data/${run}/${variable}.json`)).json(),
  proposalMetadata: async () => HOME_PROPOSALS,
}

const gqlHandlers = [
  graphql
    .link(`${BASE_URL}graphql`)
    .operation(async ({ operationName, query, variables }) => {
      const resolution = await resolveOperation(operationName, {
        query,
        variables,
        source,
        accessibleProposals: ACCESSIBLE,
      })
      if (!resolution.resolved) {
        console.error(`[mock] No mock for GraphQL operation ${operationName}`)
      }
      return HttpResponse.json(resolution.body)
    }),
]

// Minimal graphql-ws server for live updates: acknowledge the connection and
// answer pings, but never push anything.
const liveUpdates = ws.link(`ws://${window.location.host}${BASE_URL}graphql`)

const wsHandlers = [
  liveUpdates.addEventListener('connection', ({ client }) => {
    client.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { type: string }
      if (message.type === 'connection_init') {
        client.send(JSON.stringify({ type: 'connection_ack' }))
      } else if (message.type === 'ping') {
        client.send(JSON.stringify({ type: 'pong' }))
      }
    })
  }),
]

const restHandlers = [
  http.get(`${BASE_URL}oauth/userinfo`, () => HttpResponse.json(USER)),
  // The user is always logged in, so logging out just goes back home.
  http.post(`${BASE_URL}oauth/logout`, () =>
    HttpResponse.json({ logout_url: `${BASE_URL}home` })
  ),
  http.get(`${BASE_URL}contextfile/content`, async () =>
    HttpResponse.json({
      fileContent: await (await fetchExample('context.py')).text(),
      lastModified: 0,
    })
  ),
  http.get(`${BASE_URL}contextfile/last_modified`, () =>
    HttpResponse.json({ lastModified: 0 })
  ),
]

export const handlers = [...gqlHandlers, ...wsHandlers, ...restHandlers]
