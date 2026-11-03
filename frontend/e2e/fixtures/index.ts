import { test as base, expect } from '@playwright/test'

import { mockApi, type MockApi } from '#mocks'
import { XPCS, type Example } from '#examples/xpcs'

type Fixtures = {
  example: Example
  authenticated: boolean
  api: MockApi
}

// The `api` fixture installs the mock router on every test before its body
// runs, so auth and GraphQL are stubbed before the first navigation. It mocks
// the `example` dataset, which defaults to XPCS; a spec that needs a different
// dataset overrides it with test.use({ example: ... }). `authenticated`
// defaults to true, so every existing spec runs signed in; the login spec sets
// test.use({ authenticated: false }) to hit the SSO gate.
export const test = base.extend<Fixtures>({
  example: [XPCS, { option: true }],
  authenticated: [true, { option: true }],
  api: [
    async ({ page, example, authenticated }, use) => {
      const api = await mockApi(page, example, { authenticated })
      await use(api)
      if (api.unmockedRequests.length > 0) {
        const names = [...new Set(api.unmockedRequests)].join(', ')
        throw new Error(`Unmocked API requests: ${names}`)
      }
    },
    { auto: true },
  ],
})

export { expect }
