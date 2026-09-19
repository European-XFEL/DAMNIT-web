import { test, expect } from '#fixtures'
import {
  ERROR_CELLS,
  ERROR_ROW,
  SAMPLE_GROUP,
  xpcsWithErrors,
  xpcsWithGroups,
} from '#examples/xpcs'
import { gridBox, gridCanvas, headerPoint } from '#support/grid'
import { clickWithModifier, selectCells, selectColumns } from '#support/plots'
import {
  activateCell,
  closeAside,
  hasGroups,
  openProposal,
  highlightedRow,
  selectRun,
  selectedColumnHeaders,
  selectedRunTab,
  titleOf,
} from '#support/table'

test('selecting a run shows all its variables', async ({ page, example }) => {
  await openProposal(page, example)
  await expect(selectedRunTab(page)).toHaveCount(0)

  // The first row is run 1 in the XPCS example.
  await selectRun(page, { example, row: 0 })

  const panel = page.getByRole('complementary')
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(panel.getByText('Sample type')).toBeVisible()
  await expect(panel.getByText('silica')).toBeVisible()
  await expect(panel.getByText('XGM intensity [uJ]')).toBeVisible()
  // The four XPCS variables render as image thumbnails in the panel.
  await expect(panel.locator('img')).toHaveCount(4)
})

test.describe('failed cells', () => {
  test.use({ example: xpcsWithErrors })

  // The grid's glyph and tooltip already mark a failure, so the run's list
  // keeps to the values it has.
  test('selecting a run leaves out the variables that failed for it', async ({
    page,
    example,
  }) => {
    await openProposal(page, example)

    await selectRun(page, { example, row: ERROR_ROW })

    const panel = page.getByRole('complementary')
    await expect(
      panel.getByText(titleOf(example, 'sample_type'), { exact: true })
    ).toBeVisible()
    for (const failed of ERROR_CELLS) {
      await expect(
        panel.getByText(titleOf(example, failed.variable), { exact: true })
      ).toHaveCount(0)
    }
  })
})

test.describe('grouped variables', () => {
  test.use({ example: xpcsWithGroups })

  test("selecting a run lists a group's variables under its heading", async ({
    page,
    example,
  }) => {
    await openProposal(page, example)

    await selectRun(page, { example, row: 0 })

    const panel = page.getByRole('complementary')
    const { title } = SAMPLE_GROUP
    const group = panel.getByRole('group', { name: title })
    // Under the heading, a member goes by its short title.
    await expect(group.getByText('Type', { exact: true })).toBeVisible()
    await expect(group.getByText('silica')).toBeVisible()
    await expect(group.getByText(titleOf(example, 'sample.type'))).toHaveCount(
      0
    )

    // The panel slides in, so its rows move until it reaches its width.
    await expect(panel).toHaveCSS('width', '360px')
    const heading = await group.getByText(title, { exact: true }).boundingBox()
    const ungrouped = await panel
      .getByText(titleOf(example, 'xgm_intensity'), { exact: true })
      .boundingBox()
    expect(ungrouped?.x).toBe(heading?.x)
  })
})

test('selecting another run replaces the selection', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  // Select the first run
  await selectRun(page, { example, row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')

  // Select the second run
  await selectRun(page, { example, row: 1 })
  await expect(selectedRunTab(page)).toContainText('Run: 2')
  // Single row selection: the panel follows the run, it does not stack tabs.
  await expect(selectedRunTab(page)).toHaveCount(1)
})

// The aside shows the selected run and owns nothing of its own, so closing it is
// how a user deselects: a highlighted row beside a closed panel means nothing.
test('closing the aside clears the run selection', async ({
  page,
  example,
}) => {
  await openProposal(page, example)

  await selectRun(page, { example, row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(highlightedRow(page, { row: 0 })).toBeAttached()

  await closeAside(page)

  await expect(selectedRunTab(page)).toHaveCount(0)
  await expect(highlightedRow(page, { row: 0 })).not.toBeAttached()
})

test('closing the aside hands focus back to the grid', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })

  await closeAside(page)

  await expect(gridCanvas(page)).toBeFocused()
})

// Selecting a column is how a summary plot starts, so it must not throw away the
// run a user is reading.
test('a column click keeps the selected run', async ({ page, example }) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')

  await selectColumns(page, { example, cols: [2] })

  await expect(selectedColumnHeaders(page)).toHaveCount(1)
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(highlightedRow(page, { row: 0 })).toBeAttached()
})

// Glide reports that last column going as an empty selection, the same shape
// as Escape.
test('unselecting the last selected column keeps the selected run', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })
  await selectColumns(page, { example, cols: [2] })
  await expect(selectedColumnHeaders(page)).toHaveCount(1)

  const box = await gridBox(page)
  await clickWithModifier(page, [
    headerPoint(box, { col: 2, grouped: hasGroups(example) }),
  ])

  await expect(selectedColumnHeaders(page)).toHaveCount(0)
  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(highlightedRow(page, { row: 0 })).toBeAttached()
})

test('clicking the row marker of the selected run again clears it', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')

  await selectRun(page, { example, row: 0 })

  await expect(selectedRunTab(page)).toHaveCount(0)
  await expect(highlightedRow(page, { row: 0 })).not.toBeAttached()
})

// Glide reports this click as the same empty selection that unselecting the
// last column does.
test('clicking the row marker of the selected run clears it while a column is selected', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })
  await selectColumns(page, { example, cols: [2] })
  await expect(selectedColumnHeaders(page)).toHaveCount(1)

  await selectRun(page, { example, row: 0 })

  await expect(selectedRunTab(page)).toHaveCount(0)
  await expect(highlightedRow(page, { row: 0 })).not.toBeAttached()
})

test('a cell click on another row keeps the selected run', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')

  await selectCells(page, { example, cells: [{ col: 2, row: 2 }] })

  await expect(selectedRunTab(page)).toContainText('Run: 1')
  await expect(highlightedRow(page, { row: 0 })).toBeAttached()
})

test('escape clears the selected run', async ({ page, example }) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')

  await page.keyboard.press('Escape')

  await expect(selectedRunTab(page)).toHaveCount(0)
  await expect(highlightedRow(page, { row: 0 })).not.toBeAttached()
})

test('escape clears the selected run while a column is selected', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await selectRun(page, { example, row: 0 })
  await selectColumns(page, { example, cols: [2] })
  await expect(selectedRunTab(page)).toContainText('Run: 1')

  await page.keyboard.press('Escape')

  await expect(selectedColumnHeaders(page)).toHaveCount(0)
  await expect(selectedRunTab(page)).toHaveCount(0)
})

// Glide reports Shift+Space on the selected row as the same empty selection a
// Ctrl/Cmd-click on the last column does, so the resting pointer must not count.
test('shift+space clears the selected run while the pointer rests on a header', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await activateCell(page, { example, col: 2, row: 0 })
  await expect(selectedRunTab(page)).toContainText('Run: 1')

  const box = await gridBox(page)
  const header = headerPoint(box, { col: 2, grouped: hasGroups(example) })
  await page.mouse.move(header.x, header.y)
  await page.keyboard.press('Shift+Space')

  await expect(selectedRunTab(page)).toHaveCount(0)
  await expect(highlightedRow(page, { row: 0 })).not.toBeAttached()
})
