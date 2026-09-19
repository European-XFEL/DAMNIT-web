import { test, expect } from '#fixtures'
import { XPCS } from '#examples/xpcs'
import { fullMetadata } from '#mocks'
import { WIDE_VIEWPORT } from '#support/grid'
import {
  openProposal,
  highlightedRow,
  selectRun,
  selectedRunTab,
} from '#support/table'

test.use({ viewport: WIDE_VIEWPORT })

// The run list arrives in the server's order with no client sort, so a run
// pushed ahead of the selected one moves every row below it down. The selection
// is keyed by run identity rather than by row, so it follows its run down.
test('a run pushed above the selected one moves its highlight, not its selection', async ({
  page,
  api,
  example,
}) => {
  await openProposal(page, example)

  // Select run 2, the second row, so there are rows on both sides of it.
  await selectRun(page, { example, row: 1 })
  await expect(selectedRunTab(page)).toContainText('Run 2')
  await expect(highlightedRow(page, { row: 1 })).toBeAttached()

  // Push a run that lands at the top of the list.
  const inserted = XPCS.meta.runs[XPCS.meta.runs.length - 1] + 1
  api.pushLatestData({
    metadata: fullMetadata(example.meta, [inserted, ...XPCS.meta.runs]),
    runs: {
      [inserted]: {
        run: { dtype: 'number', value: inserted },
        n_trains: { dtype: 'number', value: 4242 },
      },
    },
  })

  // Run 2 is now the third row, and both the aside and the highlight name it.
  await expect(highlightedRow(page, { row: 2 })).toBeAttached()
  await expect(selectedRunTab(page)).toContainText('Run 2')
  await expect(highlightedRow(page, { row: 1 })).not.toBeAttached()
})
