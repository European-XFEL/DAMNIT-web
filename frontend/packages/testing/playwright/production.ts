import { test as base, expect } from '@playwright/test'

// Fails a site or demo test on any console error, uncaught page error or
// request to another host, reported once the test body is done.
export const test = base.extend<{ errorCheck: void }>({
  errorCheck: [
    async ({ page, context, baseURL }, use) => {
      const appHost = new URL(baseURL!).host
      const offSiteRequests = new Set<string>()
      const errors: string[] = []

      // The page never sees the requests the demo's service worker sends on;
      // the context does. A blob: or data: URL has no host.
      context.on('request', (request) => {
        const { host } = new URL(request.url())
        if (host && host !== appHost) {
          offSiteRequests.add(request.url())
        }
      })
      // A failed load names its file only in the location, not the text.
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(
            `Console error: ${message.text()} (${message.location().url})`
          )
        }
      })
      page.on('pageerror', (error) => {
        errors.push(`Page error: ${error.message}`)
      })

      await use()

      const failures = [
        ...Array.from(offSiteRequests, (url) => `Off-site request: ${url}`),
        ...errors,
      ]
      if (failures.length > 0) {
        throw new Error(failures.join('\n'))
      }
    },
    { auto: true },
  ],
})

export { expect }
