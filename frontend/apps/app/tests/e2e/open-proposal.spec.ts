import type { Page } from '@playwright/test'

import {
  canScroll,
  gridScroller,
} from '@damnit-frontend/testing/playwright/grid'
import { test, expect } from '@damnit-frontend/testing/playwright/production'
import {
  columnCells,
  columnTitles,
  expectRunRows,
} from '@damnit-frontend/testing/playwright/table'
import {
  columnOfTitle,
  openMockProposal,
  RUNS,
} from '#tests/e2e/support/real-api'

async function cellsOfTitle(page: Page, title: string) {
  return columnCells(page, await columnOfTitle(page, title))
}

test('a proposal opens on every run DAMNIT extracted, their values and its grouped columns', async ({
  page,
}) => {
  await openMockProposal(page)

  await expectRunRows(page, RUNS.length)
  await expect(await cellsOfTitle(page, 'Run')).toHaveText(RUNS.map(String))
  await expect(await cellsOfTitle(page, 'Trains')).toHaveText([
    '101',
    '102',
    '103',
    '105',
  ])
  await expect(await cellsOfTitle(page, 'Sample')).toHaveText([
    'Sample 001',
    'Sample 002',
    'Sample 003',
    'Sample 005',
  ])

  // A grouped column's header drops the group's title, which the group row
  // above it shows instead. The group comes last, so scroll it into the mirror.
  await expect.poll(() => canScroll(page, 'horizontal')).toBe(true)
  await gridScroller(page).evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect
    .poll(async () =>
      (await columnTitles(page)).filter((title) => title === 'Position [mm]')
    )
    .toHaveLength(2)
})
