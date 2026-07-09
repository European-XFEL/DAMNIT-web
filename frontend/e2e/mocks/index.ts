import type { Page } from '@playwright/test'

import {
  REST_API_PREFIXES,
  shapeMetadata,
  shapeTableData,
  unmockedOperationError,
} from '@damnit-frontend/shared/mocks'

import { type Example } from '#examples/xpcs'

export type MockApi = {
  // GraphQL operations and REST paths the router had no mock for; the test
  // fixture fails the test when any were seen, so mock drift surfaces loudly
  // instead of as an empty response or a silent request to the real network.
  unmockedRequests: string[]
}

function resolveGraphql(
  operationName: string,
  variables: Record<string, unknown>,
  example: Example
) {
  switch (operationName) {
    case 'TableMetadataQuery':
      return { data: { metadata: shapeMetadata(example.meta) } }
    // All three table queries return the same full payload. This mock does not
    // reproduce the server's @lightweight null-out of heavy values or its
    // page/per_page slicing; add that to shapeTableData when a table,
    // deferred, or pagination test needs it.
    case 'TableDataQuery':
    case 'LightweightTableDataQuery':
    case 'DeferredTableDataQuery':
      return {
        data: shapeTableData(example.data, {
          names: variables.names as string[] | null | undefined,
        }),
      }
    case 'ProposalMetadata':
      return { data: { proposal_metadata: example.proposalMetadata } }
    // One query per run: a data plot over N runs fires N of these. The file is
    // returned raw, mirroring the demo handler; the client splits data from
    // metadata.
    case 'ExtractedDataQuery':
      try {
        return {
          data: {
            extracted_data: example.extractedData(
              variables.run as number,
              variables.variable as string
            ),
          },
        }
      } catch (error) {
        // A missing file means the example drifted from the test: return null so
        // it flows through the unmocked-request path and fails the test loudly.
        // Any other error (malformed json, a bug in extractedData) is a real
        // fault, so let it surface with its own stack instead of reading as
        // drift.
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          return null
        }
        throw error
      }
    default:
      return null
  }
}

export async function mockApi(page: Page, example: Example): Promise<MockApi> {
  const api: MockApi = { unmockedRequests: [] }

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

  await page.route('**/graphql', (route) => {
    const { operationName, variables } = (route.request().postDataJSON() ??
      {}) as {
      operationName: string
      variables?: Record<string, unknown>
    }
    const json = resolveGraphql(operationName, variables ?? {}, example)
    if (json === null) {
      api.unmockedRequests.push(operationName)
      return route.fulfill({ json: unmockedOperationError(operationName) })
    }
    return route.fulfill({ json })
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
