import { expect, type Locator, type Page } from '@playwright/test'

// Monaco renders each visible source line into a `.view-line` node. It
// virtualizes, so only lines in the viewport exist in the DOM; match on a line
// known to sit at the top of the file, never one reached by scrolling.
export function editorLine(page: Page, text: string): Locator {
  return page.locator('.view-line', { hasText: text })
}

// The tab's title is its accessible name.
export function contextFileTab(page: Page): Locator {
  return page.getByRole('tab', { name: 'Context File' })
}

// Open the Context File tab and wait until Monaco has mounted with its content.
// Waiting on the content response (like waitForTableData) lets the drift guard
// see the request and keeps the first assertion from racing the fetch.
export async function openContextFile(page: Page) {
  const content = page.waitForResponse('**/contextfile/content**')
  await contextFileTab(page).click()
  await content
  await expect(page.locator('.view-line').first()).toBeVisible()
}

// Jump Monaco to the end of the file. The click focuses the editor (a read-only
// editor still takes a cursor); Ctrl+End then reveals the last line, a
// deterministic scroll the wheel can't guarantee under smoothScrolling.
export async function scrollEditorToEnd(page: Page) {
  await page.locator('.view-lines').click()
  await page.keyboard.press('Control+End')
}
