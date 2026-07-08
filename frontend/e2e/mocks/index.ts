import type { Page } from '@playwright/test'

import {
  MockSeedMiss,
  REST_API_PREFIXES,
  resolveOperation,
  type MockSeed,
} from '@damnit-frontend/shared/mocks'

import { type Example } from '#examples/xpcs'

export type MockApi = {
  // GraphQL operations and REST paths the router had no mock for; the test
  // fixture fails the test when any were seen, so mock drift surfaces loudly
  // instead of as an empty response or a silent request to the real network.
  unmockedRequests: string[]
}

export async function mockApi(page: Page, example: Example): Promise<MockApi> {
  const api: MockApi = { unmockedRequests: [] }

  // One example per test, so the seed ignores the requested proposal. A missing
  // (run, variable) file surfaces as ENOENT; translate it to MockSeedMiss so
  // the resolver reports drift instead of letting readFileSync hang the route.
  const seed: MockSeed = {
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
          throw new MockSeedMiss()
        }
        throw error
      }
    },
    proposalMetadata: async () => example.proposalMetadata,
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

  await page.route('**/oauth/userinfo', (route) => {
    return route.fulfill({ json: example.userInfo })
  })

  await page.route('**/graphql', async (route) => {
    const { operationName, variables } = (route.request().postDataJSON() ??
      {}) as {
      operationName: string
      variables?: Record<string, unknown>
    }
    const resolution = await resolveOperation(
      operationName,
      variables ?? {},
      seed
    )
    if (!resolution.resolved) {
      api.unmockedRequests.push(resolution.operationName)
    }
    return route.fulfill({ json: resolution.body })
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
