import { test, expect } from '#fixtures/production'
import { XPCS } from '#examples/xpcs'
import { editorLine, openContextFile } from '#support/context-file'
import { statusBar } from '#support/dashboard'
import { openExample } from '#support/demo'

const firstLine = XPCS.contextFile.split('\n')[0]

test('the context file shows the example code, and the status bar says the demo has no live updates', async ({
  page,
}) => {
  await openExample(page, 'xpcs')
  await openContextFile(page)

  await expect(editorLine(page, firstLine)).toBeVisible()
  await expect(statusBar(page).getByRole('status')).toHaveText(
    'The demo has no live updates.'
  )
})
