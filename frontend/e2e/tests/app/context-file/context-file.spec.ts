import { test, expect } from '#fixtures'
import { XPCS } from '#examples/xpcs'
import {
  contextFileNavItem,
  editorLine,
  openContextFile,
  scrollEditorToEnd,
} from '#support/context-file'
import { showTable } from '#support/dashboard'
import { openProposal } from '#support/table'

// Derive the first and last lines from the fixture so the assertions track the
// example instead of hard-coding its contents.
const lines = XPCS.contextFile.trimEnd().split('\n')
const firstLine = lines[0]
const lastLine = lines[lines.length - 1]

test('the context file view shows the proposal code, read-only', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
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

test('ctrl+f on the context file opens Monaco search', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openContextFile(page)

  // Focus is still on the nav entry that opened the view, not in the editor.
  await page.keyboard.press('Control+f')
  await expect(page.locator('.find-widget')).toBeVisible()
})

test('the editor keeps its scroll position across a view switch', async ({
  page,
  example,
}) => {
  await openProposal(page, example)
  await openContextFile(page)
  await expect(editorLine(page, firstLine)).toBeVisible()

  // Scroll to the end so a bottom-of-file line replaces the top one in view.
  await scrollEditorToEnd(page)
  await expect(editorLine(page, lastLine)).toBeVisible()
  await expect(editorLine(page, firstLine)).toHaveCount(0)

  // Leave the view and come back. Only the active view is mounted, so this
  // remounts the editor.
  await showTable(page)
  await contextFileNavItem(page).click()

  await expect(editorLine(page, lastLine)).toBeVisible()
  await expect(editorLine(page, firstLine)).toHaveCount(0)
})

test('polling picks up an edited file and refreshes the editor', async ({
  page,
  api,
  example,
}) => {
  // Fake clock (spike-confirmed: Monaco paints and repaints, and RTK Query's
  // poll fires, under faked timers) so fastForward drives the 5s poll instantly.
  await page.clock.install()

  await openProposal(page, example)
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

test('a failed content load shows the editor error', async ({
  page,
  example,
}) => {
  // Registered after the fixture's routes, so Playwright's last-wins order lets
  // this 500 override the mocked content. It fulfils the request itself, so the
  // catch-all never sees it and the drift guard stays clean. No `detail` field,
  // so the component falls back to its generic message.
  await page.route('**/contextfile/content**', (route) =>
    route.fulfill({ status: 500, json: { error: 'Internal Server Error' } })
  )

  await openProposal(page, example)
  await contextFileNavItem(page).click()

  await expect(
    page.getByText(
      'The server returned an error. Reload the page to try again.'
    )
  ).toBeVisible()
})

test('a failed content load surfaces the backend error detail', async ({
  page,
  example,
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

  await openProposal(page, example)
  await contextFileNavItem(page).click()

  await expect(page.getByText('context.py has a syntax error')).toBeVisible()
})

test('a failed content load with a structured detail shows the generic message', async ({
  page,
  example,
}) => {
  // A FastAPI 422 carries `detail` as a list of objects. Rendered as-is it
  // crashed the whole view, so a detail that is not text falls back instead.
  await page.route('**/contextfile/content**', (route) =>
    route.fulfill({
      status: 422,
      json: {
        detail: [
          {
            type: 'int_parsing',
            loc: ['query', 'proposal_number'],
            msg: 'Input should be a valid integer',
            input: '',
          },
        ],
      },
    })
  )

  await openProposal(page, example)
  await contextFileNavItem(page).click()

  await expect(
    page.getByText(
      'The server returned an error. Reload the page to try again.'
    )
  ).toBeVisible()
})
