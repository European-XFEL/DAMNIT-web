import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@damnit-frontend/testing/playwright/production'
import {
  editorLine,
  openContextFile,
} from '@damnit-frontend/testing/playwright/context-file'
import { DAMNIT_DIR, openMockProposal } from '#tests/e2e/support/real-api'

test("the context file view shows the proposal's context.py", async ({
  page,
}) => {
  const contextFile = readFileSync(join(DAMNIT_DIR, 'context.py'), 'utf-8')
  const firstLine = contextFile.split('\n')[0]

  await openMockProposal(page)
  await openContextFile(page)

  await expect(editorLine(page, firstLine)).toBeVisible()
})
