import { expect, type Locator, type Page } from '@playwright/test'

import { XPCS } from '#examples/xpcs'

// The grid is a <canvas>. Glide Data Grid mirrors the visible columns into a
// <table role="grid"> as canvas fallback content, which the browser never
// paints, so it has no layout box and getByRole would treat it as hidden.
// Helpers that read the grid therefore match on the role attribute; popover
// rows are ordinary painted DOM, so getByRole works for those.

// Source-column index of the frozen Run column (the row-marker column is 0).
// Run is always present and never hidden, so it is the stable selection target.
const RUN_COLUMN = 1

export async function openProposal(page: Page) {
  await page.goto(`proposal/${XPCS.proposalMetadata[0].number}`)
  // Wait for the canvas to paint so column assertions don't race the data load.
  await expect(page.getByTestId('data-grid-canvas')).toBeVisible()
}

// aria-colcount is the live data-column count, excluding the row-marker column.
export async function expectVisibleColumns(page: Page, count: number) {
  await expect(page.locator('[role="grid"]')).toHaveAttribute(
    'aria-colcount',
    String(count)
  )
}

// Glide only mirrors headers within the horizontal viewport, so toHaveCount(1)
// means on-screen and toHaveCount(0) means hidden. For whether a column exists
// at all, use expectVisibleColumns.
export function columnHeader(page: Page, title: string): Locator {
  return page.locator('[role="columnheader"]', { hasText: title })
}

// Opens a Variables/Tags popover from its toolbar button, returning the button
// so tests can assert its count badge afterwards.
export async function openPopover(page: Page, name: string): Promise<Locator> {
  const button = page.getByRole('button', { name })
  await button.click()
  return button
}

export function rowCheckbox(page: Page, name: string): Locator {
  return page.getByRole('row', { name }).getByRole('checkbox')
}

// `row` must be within the initial vertical fold; this does not scroll it in.
export async function selectRun(page: Page, { row }: { row: number }) {
  // The a11y tree renders a beat after the canvas, and Glide only mirrors rows
  // in the current vertical window, so wait for the target cell itself.
  const cell = page.getByTestId(`glide-cell-${RUN_COLUMN}-${row}`)
  await expect(cell).toBeAttached()
  // Shift+Space is Glide's selectRow keybinding: it selects the focused cell's
  // row, so the column is irrelevant.
  await cell.focus()
  await page.keyboard.press('Shift+Space')
}

// The aside's Run tab, whose title becomes `Run: <n>` once a run is selected.
// This is the primary downstream signal that a grid selection took effect.
export function selectedRunTab(page: Page): Locator {
  return page.getByRole('tab', { name: /Run:\s*\d+/ })
}
