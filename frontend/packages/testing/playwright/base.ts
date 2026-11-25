import type { PlaywrightTestConfig } from '@playwright/test'

export const isCI = !!process.env.CI

// Settings every suite shares. Each config spreads this and adds its own
// projects and web server.
export const baseConfig = {
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
} satisfies PlaywrightTestConfig
