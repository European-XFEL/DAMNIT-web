import type { Page } from '@playwright/test'

import {
  MockDataNotFound,
  REST_API_PREFIXES,
  resolveOperation,
  unmockedOperationError,
  type MockDataSource,
} from '@damnit-frontend/shared/mocks'

import { accessibleProposals, type Example } from '#examples/xpcs'

export type MockApi = {
  // GraphQL operations and REST paths the router had no mock for; the test
  // fixture fails the test when any were seen, so mock drift surfaces loudly
  // instead of as an empty response or a silent request to the real network.
  unmockedRequests: string[]
}

type MockApiOptions = {
  authenticated: boolean
}

export async function mockApi(
  page: Page,
  example: Example,
  { authenticated }: MockApiOptions
): Promise<MockApi> {
  const api: MockApi = { unmockedRequests: [] }

  // Session state the routes read: userinfo answers by it, and logout flips it
  // off so the LoggedOutPage re-fetch takes the "logged out" branch.
  let authed = authenticated

  // variables.proposal arrives as a string, so hold the accessible set as strings.
  const accessible = accessibleProposals(example).map(String)

  // One example per test, so the source ignores the requested proposal. A
  // missing (run, variable) file surfaces as ENOENT; translate it to
  // MockDataNotFound so the resolver reports it as clean drift. Any other error
  // falls through to the route handler's catch below, which fails the test
  // loudly instead of stalling.
  const source: MockDataSource = {
    runs: async () => ({ meta: example.meta, data: example.data }),
    extractedData: async ({ run, variable }) => {
      try {
        return example.extractedData(run, variable)
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          throw new MockDataNotFound()
        }
        throw error
      }
    },
    // The home page fires one ProposalMetadata query per semester, so filter to
    // the requested numbers; otherwise a multi-semester example would leak every
    // proposal into every sub-table.
    proposalMetadata: async ({ proposalNumbers }) =>
      example.proposalMetadata.filter((proposal) =>
        (proposalNumbers ?? []).includes(proposal.number)
      ),
  }

  // Registered first so the specific routes below take precedence (Playwright
  // runs the last-registered matching handler first). A REST call none of them
  // cover is recorded and failed; everything else (assets, app bundle) falls
  // through to the server.
  await page.route('**/*', (route) => {
    const { pathname } = new URL(route.request().url())
    const isUnmockedApi = REST_API_PREFIXES.some((prefix) =>
      pathname.includes(`/${prefix}`)
    )
    if (isUnmockedApi) {
      api.unmockedRequests.push(pathname)
      return route.fulfill({
        status: 500,
        json: { error: `Unmocked request: ${pathname}` },
      })
    }
    return route.fallback()
  })

  // The real endpoint 500s with "No user info in session" when the cookie is
  // gone, which PrivateRoute reads as isError and the LoggedOutPage reads as
  // logged out. Mirror that shape rather than a 401.
  await page.route('**/oauth/userinfo**', (route) =>
    authed
      ? route.fulfill({ json: example.userInfo })
      : route.fulfill({
          status: 500,
          json: { error: 'No user info in session' },
        })
  )

  // Login is a full-page navigation to a same-origin URL. Fulfil it empty so the
  // navigation completes (and the catch-all does not log it as drift); the login
  // spec asserts the request itself, not the resulting blank page.
  await page.route('**/oauth/login**', (route) =>
    route.fulfill({ status: 200, body: '' })
  )

  // Logout returns no logout_url, so the app takes its in-app branch: reset the
  // store and navigate to /logged-out. Flip the session off so the LoggedOutPage
  // re-fetch of userinfo 500s and the "You have been logged out" branch renders,
  // modelling the cleared session cookie.
  await page.route('**/oauth/logout**', (route) => {
    authed = false
    return route.fulfill({ json: {} })
  })

  await page.route('**/graphql', async (route) => {
    const { operationName, variables } = (route.request().postDataJSON() ??
      {}) as {
      operationName: string
      variables?: Record<string, unknown>
    }

    // A query for a proposal the user cannot access errors, the way the backend
    // rejects one outside the session. useProposal reads that error as notFound
    // and ProposalWrapper redirects to /not-found. Handled here, so it is not
    // drift. Operations without a proposal (e.g. ProposalMetadata) skip.
    const proposal = variables?.proposal
    if (proposal != null && !accessible.includes(String(proposal))) {
      return route.fulfill({
        json: {
          errors: [{ message: `No access to proposal ${proposal}` }],
        },
      })
    }

    try {
      const resolution = await resolveOperation(operationName, {
        variables: variables ?? {},
        source,
      })
      if (!resolution.resolved) {
        api.unmockedRequests.push(operationName)
      }
      return route.fulfill({ json: resolution.body })
    } catch (error) {
      api.unmockedRequests.push(
        `${operationName} (${(error as Error).message})`
      )
      return route.fulfill({ json: unmockedOperationError(operationName) })
    }
  })

  await page.route('**/contextfile/content**', (route) => {
    return route.fulfill({
      json: { fileContent: example.contextFile, lastModified: 0 },
    })
  })

  await page.route('**/contextfile/last_modified**', (route) => {
    return route.fulfill({ json: { lastModified: 0 } })
  })

  // Silence the graphql-ws subscription: accept the socket but never answer, so
  // the client stays connected instead of reconnecting forever.
  await page.routeWebSocket('**/graphql', () => {})

  return api
}
