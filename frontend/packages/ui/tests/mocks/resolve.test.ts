import { expect, test } from 'vitest'

import {
  MockDataNotFound,
  resolveOperation,
  type MockDataSource,
  type RunData,
} from '@damnit-frontend/shared/mocks'

const PROPOSAL = '1234'

// Thirteen runs, as in the xpcs example, so ten fit on the first page. Listed
// newest first, so a page that skips sorting shows the wrong runs.
const RUNS: RunData[] = Array.from({ length: 13 }, (_, index) => ({
  source: { ref: 'raw', run_number: 13 - index },
  variables: {},
}))

const source: MockDataSource = {
  runs: async () => ({
    meta: { sources: {}, variables: {}, runs: [], tags: {} },
    data: RUNS,
  }),
  extractedData: async () => {
    throw new MockDataNotFound()
  },
  proposalMetadata: async () => [],
}

async function resolveRuns(
  operationName: string,
  variables: Record<string, unknown>
) {
  const { body } = await resolveOperation(operationName, {
    query: '',
    variables: { proposal: PROPOSAL, ...variables },
    source,
  })
  const { runs } = body.data as { runs: { run: number }[] }

  return runs.map((run) => run.run)
}

test('page 2 of 13 runs at 10 per page holds the last 3', async () => {
  const runs = await resolveRuns('TableDataQuery', { page: 2, per_page: 10 })

  expect(runs).toEqual([11, 12, 13])
})

test('a query that sends no page gets the first 10 runs', async () => {
  const runs = await resolveRuns('TableDataQuery', {})

  expect(runs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
})

test('ids narrow the runs before paging', async () => {
  const ids = [12, 13].map((run) => ({ proposal: PROPOSAL, run }))
  const runs = await resolveRuns('SelectedRunQuery', { ids })

  expect(runs).toEqual([12, 13])
})
