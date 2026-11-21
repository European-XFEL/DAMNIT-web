import { test, expect } from '#fixtures/production'
import { cell, expectRunRows, readRunRows } from '#support/table'
import { addNextRun, columnOfTitle, openMockProposal } from '#support/real-api'

test('a run DAMNIT extracts while the proposal is open appears with no reload', async ({
  page,
}) => {
  // DAMNIT takes a few seconds to extract a run.
  test.setTimeout(120_000)

  await openMockProposal(page)
  const trains = await columnOfTitle(page, 'Trains')
  await expect(cell(page, { col: trains, row: 0 })).toHaveText('101')

  // A failed try or an earlier run may have added runs already.
  const runsBefore = await readRunRows(page)
  await addNextRun()

  // The grid never paints a run added at the end in this harness.
  await expectRunRows(page, runsBefore + 1)
})
