import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import type { Page } from '@playwright/test'

import {
  columnTitles,
  openDashboard,
} from '@damnit-frontend/testing/playwright/table'

// Found by its uv.lock rather than by counting folders, so moving this file
// cannot point it at the wrong one.
function findRepoRoot() {
  let folder = dirname(fileURLToPath(import.meta.url))
  while (!existsSync(join(folder, 'uv.lock'))) {
    const parent = dirname(folder)
    if (parent === folder) {
      throw new Error('no uv.lock above the real-API support file')
    }

    folder = parent
  }

  return folder
}

const REPO_ROOT = findRepoRoot()
const PROPOSALS_DIR = join(REPO_ROOT, 'api/tests/mock/proposals')
const BUILDER = join(PROPOSALS_DIR, 'build_proposals.py')
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
  `damnit-e2e-real-api-${userInfo().username}`
)

// A retry or a rerun on the same copy adds a run of its own.
export async function addNextRun() {
  await promisify(execFile)('uv', [
    'run',
    '--no-sync',
    '--project',
    REPO_ROOT,
    'python',
    BUILDER,
    '--next-run',
    DAMNIT_DIR,
  ])
}
