import { test, expect } from '#fixtures'

import { XPCS } from '#examples/xpcs'
import {
  contextFileTab,
  editorLine,
  openContextFile,
  scrollEditorToEnd,
} from '#support/context-file'
import { openProposal } from '#support/table'

// Derive the first and last lines from the fixture so the assertions track the
// example instead of hard-coding its contents.
const lines = XPCS.contextFile.trimEnd().split('\n')
const firstLine = lines[0]
const lastLine = lines[lines.length - 1]

test('the Context File tab shows the proposal code, read-only', async ({
  page,
}) => {
  await openProposal(page)
  await openContextFile(page)

  await expect(editorLine(page, firstLine)).toBeVisible()
  await expect(page.getByText('🔒 Read-only')).toBeVisible()

  // Read-only means edits are dropped, not just labelled. Read Monaco's model
  // rather than a `.view-line`: the model updates synchronously on input, so a
  // view-line check would race the async repaint and pass even if editable.
  const rejected = '# should not be inserted'
  await editorLine(page, firstLine).click()
  await page.keyboard.type(rejected)
  const models = await page.evaluate(() => {
    const { monaco } = globalThis as unknown as {
      monaco: { editor: { getModels(): { getValue(): string }[] } }
    }
    return monaco.editor.getModels().map((model) => model.getValue())
  })
  expect(models.join('\n')).not.toContain(rejected)
})

test('opening the tab focuses the editor so Ctrl+F opens Monaco search', async ({
  page,
}) => {
  await openProposal(page)
  await openContextFile(page)

  // No click into the editor first: if the tab handed focus to Monaco, Ctrl+F
  // opens its find widget. Without that focus the keystroke would fall through
  // to the browser's own page search and no find widget would appear.
  await page.keyboard.press('Control+f')
  await expect(page.locator('.find-widget')).toBeVisible()
})

test('the editor keeps its scroll position across a tab switch', async ({
  page,
}) => {
  await openProposal(page)
  await openContextFile(page)
  await expect(editorLine(page, firstLine)).toBeVisible()

  // Scroll to the end so a bottom-of-file line replaces the top one in view.
  await scrollEditorToEnd(page)
  await expect(editorLine(page, lastLine)).toBeVisible()
  await expect(editorLine(page, firstLine)).toHaveCount(0)

  // Leave the tab and come back. keepMounted={false} unmounts and remounts the
  // editor, which restores the saved view state instead of resetting to the top.
  await page.getByRole('tab', { name: 'Table' }).click()
  await expect(page.getByTestId('data-grid-canvas')).toBeVisible()
  await contextFileTab(page).click()

  await expect(editorLine(page, lastLine)).toBeVisible()
  await expect(editorLine(page, firstLine)).toHaveCount(0)
})

test('polling picks up an edited file and refreshes the editor', async ({
  page,
  api,
}) => {
  // Fake clock (spike-confirmed: Monaco paints and repaints, and RTK Query's
  // poll fires, under faked timers) so fastForward drives the 5s poll instantly.
  await page.clock.install()

  await openProposal(page)
  await openContextFile(page)
  await expect(editorLine(page, firstLine)).toBeVisible()

  // Edit the file on disk; the marker sits on the first line so Monaco's
  // virtualization can't scroll it out of the DOM.
  const marker = '# EDITED BETWEEN POLLS'
  api.touchContextFile(`${marker}\nprint("hello")\n`)

  // Advance past the 5s interval: the poll sees a newer stamp and refetches.
  await page.clock.fastForward('00:05')

  await expect(editorLine(page, marker)).toBeVisible()
  await expect(editorLine(page, firstLine)).toHaveCount(0)
})

test('a failed content load shows the editor error', async ({ page }) => {
  // Registered after the fixture's routes, so Playwright's last-wins order lets
  // this 500 override the mocked content. It fulfils the request itself, so the
  // catch-all never sees it and the drift guard stays clean. No `detail` field,
  // so the component falls back to its generic message.
  await page.route('**/contextfile/content**', (route) =>
    route.fulfill({ status: 500, json: { error: 'Internal Server Error' } })
  )

  await openProposal(page)
  await contextFileTab(page).click()

  await expect(page.getByText('Failed to load file content')).toBeVisible()
})

test('a failed content load surfaces the backend error detail', async ({
  page,
}) => {
  // Same last-wins override as the fallback test, but the body carries a `detail`
  // field, so the component shows the backend's own message instead of the
  // generic fallback. This is the branch real context.py errors travel through.
  await page.route('**/contextfile/content**', (route) =>
    route.fulfill({
      status: 500,
      json: { detail: 'context.py has a syntax error' },
    })
  )

  await openProposal(page)
  await contextFileTab(page).click()

  await expect(page.getByText('context.py has a syntax error')).toBeVisible()
})
