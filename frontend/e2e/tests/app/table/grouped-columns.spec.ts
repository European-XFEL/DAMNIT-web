import { test, expect } from '#fixtures'
import { xpcsWithGroups } from '#examples/xpcs'
import { WIDE_VIEWPORT } from '#support/grid'
import { openSummaryPlot, plotEntry } from '#support/plots'
import {
  clickGroupHeader,
  columnHandle,
  columnOf,
  columnTitles,
  contextMenu,
  expectVisibleColumns,
  groupAction,
  openPopover,
  openProposal,
  rightClickHeader,
  rowCheckbox,
  searchMarks,
  selectedColumnHeaders,
  tabToMatch,
  titleOf,
} from '#support/table'

// A column under each header box: Trains under the blank one, Type under
// Sample's.
const TRAINS_COLUMN = columnOf(xpcsWithGroups, 'n_trains')
const SAMPLE_COLUMN = columnOf(xpcsWithGroups, 'sample.type')

// The group's numeric column, so the plot it opens has a figure to draw.
const SAMPLE_X = 'sample.x'

// The group bar is painted on the canvas and its labels never reach the
// accessibility tree, so these cover what it does to everything around it.
test.use({ example: xpcsWithGroups, viewport: WIDE_VIEWPORT })

test('a grouped column header drops the words its group already shows', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // The group sits mid-table, so this spans the ungrouped columns on both sides
  // of it as well as the three that lose their prefix.
  const titles = await columnTitles(page)
  expect(titles.slice(0, 7)).toEqual([
    'Run',
    'Trains',
    'Pulses',
    'Type',
    'X [mm]',
    'Y [mm]',
    'Scan type',
  ])
})

test('a plot from a grouped column keeps the group in its label', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await openSummaryPlot(page, { example, col: columnOf(example, SAMPLE_X) })

  // No group header sits over a plot, so the label carries the words the column
  // header drops. Two groups can share a leaf title.
  await expect(
    plotEntry(page, `${titleOf(example, SAMPLE_X)} vs. Run`)
  ).toBeVisible()
})

test('clicking the blank group box selects nothing, pinned Run included', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await clickGroupHeader(page, TRAINS_COLUMN)

  // A header menu only opens over one or two selected columns, so it opening at
  // all says the group click left the block, pinned Run and every other
  // ungrouped column, unselected.
  await rightClickHeader(page, { example, col: TRAINS_COLUMN })
  await expect(contextMenu(page).getByText('Plot: summary')).toBeVisible()
  await expect(selectedColumnHeaders(page)).toHaveText(['Trains'])
})

test('clicking a named group box selects its columns and no others', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await clickGroupHeader(page, SAMPLE_COLUMN)

  await expect(selectedColumnHeaders(page)).toHaveText([
    'Type',
    'X [mm]',
    'Y [mm]',
  ])
})

test('a grouped variable can still be hidden on its own', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await expectVisibleColumns(page, 13)

  // The row shows the title without the group's words, but its checkbox is
  // named by the whole title, so it speaks for this column alone.
  await openPopover(page, 'Variables')
  await rowCheckbox(page, 'Sample/X [mm]').uncheck()

  await expectVisibleColumns(page, 12)
  expect(await columnTitles(page)).not.toContain('X [mm]')
})

test('hiding a group from its heading hides every column in it', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await expectVisibleColumns(page, 13)

  await openPopover(page, 'Variables')
  await groupAction(page, 'Sample').click()

  await expectVisibleColumns(page, 10)
  const titles = await columnTitles(page)
  expect(titles).not.toContain('Type')
  expect(titles).not.toContain('X [mm]')
  expect(titles).not.toContain('Y [mm]')
})

test('a partly hidden group offers to show the rest', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')
  const sample = groupAction(page, 'Sample')

  // Hide one member
  await rowCheckbox(page, 'Sample/X [mm]').uncheck()
  await expect(sample).toHaveText('Show all')

  // Complete the group
  await sample.click()
  await expectVisibleColumns(page, 13)
})

test("searching a group name marks its heading, and Tab lands on the group's handle", async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openPopover(page, 'Variables')

  await page.getByPlaceholder('Search variables').fill('sample')
  await expect(searchMarks(page)).toHaveText(['Sample'])

  await tabToMatch(page)
  await expect(columnHandle(page, 'Sample')).toBeFocused()
})
