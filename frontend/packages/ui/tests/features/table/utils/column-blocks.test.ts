import { describe, expect, test } from 'vitest'

import {
  buildColumnBlocks,
  filterColumnBlocks,
  type ColumnBlock,
} from '#src/features/table/utils/column-blocks'
import {
  ALL_VISIBLE,
  exampleBlocks,
  GROUPS,
  VARIABLES,
} from '#tests/support/columns'

const namesOf = (blocks: ColumnBlock[]) => blocks.map((block) => block.name)

describe('buildColumnBlocks', () => {
  test('a group is one block where its first member sits', () => {
    expect(namesOf(exampleBlocks())).toEqual([
      'n_trains',
      'sample',
      'scan_type',
    ])
  })

  test('a group block carries its members in table order', () => {
    const [, group] = exampleBlocks()

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
    const [group] = buildColumnBlocks({
      variables: [VARIABLES[1]],
      groups: { sample: { name: 'sample' } },
      visibility: ALL_VISIBLE,
      tagFilter: null,
    })

    expect(group).toMatchObject({ kind: 'group', title: 'sample' })
  })

  // The read path gathers a group before the popover sees it, so this is the
  // builder's own answer rather than something a user can reach.
  test('a group split across the list still comes back as one block', () => {
    const scattered = [
      VARIABLES[1],
      { name: 'n_trains', title: 'Trains', tags: [] },
      VARIABLES[2],
    ]

    const blocks = buildColumnBlocks({
      variables: scattered,
      groups: GROUPS,
      visibility: ALL_VISIBLE,
      tagFilter: null,
    })

    expect(namesOf(blocks)).toEqual(['sample', 'n_trains'])
    expect(blocks[0]).toMatchObject({
      members: [{ name: 'sample.type' }, { name: 'sample.x' }],
    })
  })

  test('an ungrouped column keeps its whole title', () => {
    expect(exampleBlocks()[0]).toMatchObject({
      kind: 'variable',
      title: 'Trains',
    })
  })

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
})

describe('filterColumnBlocks', () => {
  test('a column the search does not match drops out of the list', () => {
    expect(namesOf(filterColumnBlocks(exampleBlocks(), 'trains'))).toEqual([
      'n_trains',
    ])
  })

  test("typing a group's words keeps it and every member", () => {
    const [group] = filterColumnBlocks(exampleBlocks(), 'sample')

    expect(group).toMatchObject({
      name: 'sample',
      members: [
        { name: 'sample.type' },
        { name: 'sample.x' },
        { name: 'sample.y' },
      ],
    })
  })

  test('a group narrows to the members the search left', () => {
    const [group] = filterColumnBlocks(exampleBlocks(), 'y [mm]')

    expect(group).toMatchObject({
      name: 'sample',
      members: [{ name: 'sample.y' }],
    })
  })

  test('a group whose members all fail the search goes with them', () => {
    expect(namesOf(filterColumnBlocks(exampleBlocks(), 'scan'))).toEqual([
      'scan_type',
    ])
  })
})
