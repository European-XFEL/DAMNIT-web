import type { PlaywrightTestConfig } from '@playwright/test'

export const isCI = !!process.env.CI

// Settings every suite shares. Each config spreads this and adds its own
// projects and web server.
export const baseConfig = {
  fullyParallel: true,
  forbidOnly: isCI,
  failOnFlakyTests: isCI,
  retries: isCI ? 1 : 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-first-failure',
  },
} satisfies PlaywrightTestConfig
