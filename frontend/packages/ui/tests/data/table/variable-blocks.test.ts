import { expect, test } from 'vitest'

import type { Variable } from '#src/data/table/table-data.types'
import { buildVariableBlocks } from '#src/data/table/variable-blocks'
import type { VariableBlock } from '#src/utils/variable-blocks'
import { GROUPS, VARIABLES } from '#tests/support/columns'

const blocksOf = (variables: Variable[], { groups = GROUPS } = {}) =>
  buildVariableBlocks(variables, { groups, toItem: (_variable, item) => item })

const namesOf = (blocks: VariableBlock[]) => blocks.map((block) => block.name)

test('a group is one block where its first member sits', () => {
  expect(namesOf(blocksOf(VARIABLES))).toEqual([
    'n_trains',
    'sample',
    'scan_type',
  ])
})

test('a group block carries its members in table order', () => {
  const [, group] = blocksOf(VARIABLES)

  expect(group).toMatchObject({
    kind: 'group',
    title: 'Sample',
    members: [
      { name: 'sample.type', columnTitle: 'Type' },
      { name: 'sample.x', columnTitle: 'X [mm]' },
      { name: 'sample.y', columnTitle: 'Y [mm]' },
    ],
  })
})

test('a group with no title of its own is headed by its key', () => {
  const [group] = blocksOf([VARIABLES[1]], {
    groups: { sample: { name: 'sample' } },
  })

  expect(group).toMatchObject({ kind: 'group', title: 'sample' })
})

// The read path gathers a group before any list sees it, so this is the
// builder's own answer rather than something a user can reach.
test('a group split across the list still comes back as one block', () => {
  const scattered = [
    VARIABLES[1],
    { name: 'n_trains', title: 'Trains', tags: [] },
    VARIABLES[2],
  ]

  const blocks = blocksOf(scattered)

  expect(namesOf(blocks)).toEqual(['sample', 'n_trains'])
  expect(blocks[0]).toMatchObject({
    members: [{ name: 'sample.type' }, { name: 'sample.x' }],
  })
})

test('an ungrouped variable keeps its whole title', () => {
  expect(blocksOf(VARIABLES)[0]).toMatchObject({
    kind: 'variable',
    title: 'Trains',
  })
})
