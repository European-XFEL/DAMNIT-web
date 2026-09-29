import { test, expect } from '#fixtures'
import { xpcsWithGroups } from '#examples/xpcs'
import { WIDE_VIEWPORT } from '#support/grid'
import {
  columnHandle,
  dragColumn,
  expectLeadingColumns,
  openPopover,
  openProposal,
  searchCount,
} from '#support/table'

test.use({ example: xpcsWithGroups, viewport: WIDE_VIEWPORT })

// The order the server sends, which is what the table shows until a user moves
// something. Seven columns span the ungrouped ones on both sides of the group.
const SERVER_ORDER = [
  'Run',
  'Trains',
  'Pulses',
  'Type',
  'X [mm]',
  'Y [mm]',
  'Scan type',
]

// Dragging is a pointer gesture with a keyboard equivalent, and the keyboard
// half is worth nothing if Tab walks past the open list to the grid behind it.
test('an open popover takes the keyboard, which then reaches its columns', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  // Opening it moves focus off the toolbar and into the search box
  await expect(page.getByPlaceholder('Search variables')).toBeFocused()

  // The first Tab out of the search box enters the list rather than leaving
  // for the grid
  await page.keyboard.press('Tab')

  await expect(columnHandle(page, 'Trains')).toBeFocused()
})

test('a column moved in the popover moves in the table', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  await dragColumn(page, { name: 'Trains', key: 'ArrowDown' })

  await expectLeadingColumns(page, [
    'Run',
    'Pulses',
    'Trains',
    'Type',
    'X [mm]',
    'Y [mm]',
    'Scan type',
  ])
})

test('a grouped column moves within its group and stays in it', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  // Two presses would take it out of the group if anything let it leave.
  await dragColumn(page, { name: 'Sample/Y [mm]', key: 'ArrowUp', places: 2 })

  await expectLeadingColumns(page, [
    'Run',
    'Trains',
    'Pulses',
    'Y [mm]',
    'Type',
    'X [mm]',
    'Scan type',
  ])
})

test('a group moves as one block, members and all', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  await dragColumn(page, { name: 'Sample', key: 'ArrowUp', places: 2 })

  await expectLeadingColumns(page, [
    'Run',
    'Type',
    'X [mm]',
    'Y [mm]',
    'Trains',
    'Pulses',
    'Scan type',
  ])
})

test('Reset order puts the columns back in the order the server sent', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  // Move a column away from where the server put it
  await dragColumn(page, { name: 'Trains', key: 'ArrowDown', places: 3 })
  await expectLeadingColumns(page, ['Run', 'Pulses'])

  // Put every column back
  await page.getByRole('button', { name: 'Reset order' }).click()

  await expectLeadingColumns(page, SERVER_ORDER)
})

test('a found column is dragged among its real neighbours', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')
  await page.getByPlaceholder('Search variables').fill('g2')
  await expect(searchCount(page)).toHaveText('1/1')

  // One place up, past the neighbour the table gives it
  await dragColumn(page, { name: 'XPCS g2', key: 'ArrowUp' })

  await expectLeadingColumns(page, [
    ...SERVER_ORDER,
    'XGM intensity [uJ]',
    'Total Transmission',
    'XPCS q-rings',
    'XPCS g2',
    'XPCS SAXS overview',
    'XPCS intensity outliers',
  ])
})

test('Enter steps to the next match', async ({ page, example }) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  // The four XPCS columns
  await page.getByPlaceholder('Search variables').fill('xpcs')
  await expect(searchCount(page)).toHaveText('1/4')

  await page.keyboard.press('Enter')
  await expect(searchCount(page)).toHaveText('2/4')
})
