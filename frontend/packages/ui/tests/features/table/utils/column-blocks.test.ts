import { expect, test } from 'vitest'

import { buildColumnBlocks } from '#src/features/table/utils/column-blocks'
import {
  ALL_VISIBLE,
  exampleBlocks,
  GROUPS,
  VARIABLES,
} from '#tests/support/columns'

test('a column the table is not showing is marked hidden', () => {
  const blocks = exampleBlocks({
    visibility: { ...ALL_VISIBLE, n_trains: false },
  })

  expect(blocks[0]).toMatchObject({ name: 'n_trains', isVisible: false })
})

test('a column the user cannot hide shows whatever the tags allow', () => {
  const [run] = buildColumnBlocks({
    variables: [{ name: 'run', title: 'Run', tags: [] }, ...VARIABLES],
    groups: GROUPS,
    visibility: ALL_VISIBLE,
    tagFilter: { n_trains: true },
  })

  expect(run).toMatchObject({
    name: 'run',
    canHide: false,
    isVisible: true,
    passesTagFilter: true,
  })
})
