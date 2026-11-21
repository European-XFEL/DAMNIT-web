import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'

import { openDashboard } from '@damnit-frontend/testing/playwright/table'

// The examples the demo's gallery lists, keyed by id. Read from the demo's own
// public folder, so the specs follow whatever it ships.
export const GALLERY = JSON.parse(
  readFileSync(
    new URL('../../../public/examples/index.json', import.meta.url),
    'utf-8'
  )
) as Record<string, { title: string; label: string; instrument: string }>

// Open an example from the gallery the way a visitor does, then wait for its
// grid to paint and its table data to land.
export async function openExample(page: Page, id: string) {
  await page.goto('')
  await openDashboard(page, () =>
    page.getByRole('link', { name: GALLERY[id].title }).click()
  )
}
