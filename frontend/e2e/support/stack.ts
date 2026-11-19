import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'

import { columnTitles, openDashboard } from '#support/table'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const PROPOSALS_DIR = join(REPO_ROOT, 'api/tests/mock/proposals')
export const MOCK_PROPOSAL = join(PROPOSALS_DIR, 'all-value-types')

// Copies of the builder's PROPOSAL and this case's RUNS.
export const PROPOSAL = 999001
export const RUNS = [1, 2, 3, 5]

export async function openMockProposal(page: Page) {
  await openDashboard(page, () => page.goto(`proposal/${PROPOSAL}`))
}

// The proposal's columns change with its context file, so a spec never counts
// them by hand.
export async function columnOfTitle(page: Page, title: string) {
  const titles = await columnTitles(page)
  const matches = titles.filter((each) => each === title).length
  if (matches !== 1) {
    throw new Error(
      `${matches} columns in view are titled '${title}', not one; ` +
        'the grid mirrors only the columns on screen'
    )
  }

  return titles.indexOf(title) + 1
}

// The API's web server copies the proposal here as it starts, so the suite
// never writes to the one in git. Named per user, since a shared /tmp keeps
// another user's copy out of reach of our `rm -rf`.
export const DAMNIT_DIR = join(
  tmpdir(),
  `damnit-e2e-stack-${userInfo().username}`
)
