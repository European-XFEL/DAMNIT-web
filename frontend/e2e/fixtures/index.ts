import { test as base, expect } from '@playwright/test'

import { mockApi, type MockApi } from './mock-api'

type Fixtures = {
  api: MockApi
}

// The `api` fixture installs the mock router on every test before its body
// runs, so auth and GraphQL are stubbed before the first navigation.
export const test = base.extend<Fixtures>({
  api: [
    async ({ page }, use) => {
      const api = await mockApi(page)
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
