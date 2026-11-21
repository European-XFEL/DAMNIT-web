import type { Page } from '@playwright/test'

import { test, expect } from '#fixtures/production'
import { columnCells, columnTitles, expectRunRows } from '#support/table'
import { columnOfTitle, openMockProposal, RUNS } from '#support/real-api'

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
  // above it shows instead.
  const titles = await columnTitles(page)
  expect(titles.filter((title) => title === 'Position [mm]')).toHaveLength(2)
})
