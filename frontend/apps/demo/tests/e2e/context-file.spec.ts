import { test, expect } from '@damnit-frontend/testing/playwright/production'
import {
  editorLine,
  openContextFile,
} from '@damnit-frontend/testing/playwright/context-file'
import { statusBar } from '@damnit-frontend/testing/playwright/dashboard'
import { openExample } from '#tests/e2e/support/demo'
import { CONTEXT_FILE } from '#tests/e2e/support/example'

const firstLine = CONTEXT_FILE.split('\n')[0]

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
