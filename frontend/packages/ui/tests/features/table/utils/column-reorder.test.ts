import { describe, expect, test } from 'vitest'
import type { DropResult } from '@hello-pangea/dnd'

import {
  BLOCKS_DROPPABLE,
  membersDroppable,
  reorderColumns,
} from '#src/features/table/utils/column-reorder'
import { filterVariableBlocks } from '#src/utils/variable-blocks'
import { exampleBlocks } from '#tests/support/columns'

// Only the source and destination decide a move; the rest is what the library
// carries along.
const drop = ({
  list,
  from,
  to,
}: {
  list: string
  from: number
  to: number | null
}): DropResult => ({
  draggableId: 'dragged',
  type: list,
  mode: 'FLUID',
  reason: 'DROP',
  combine: null,
  source: { droppableId: list, index: from },
  destination: to == null ? null : { droppableId: list, index: to },
})

// With no search, the list on screen is the whole list.
const reorder = (result: DropResult, { search = '' } = {}) => {
  const blocks = exampleBlocks()
  const shown = filterVariableBlocks(blocks, search)
  return reorderColumns({ blocks, shown }, result)
}

describe('reorderColumns', () => {
  test('an ungrouped column moves to where it was dropped', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 0, to: 2 }))

    expect(move?.order).toEqual([
      'sample.type',
      'sample.x',
      'sample.y',
      'scan_type',
      'n_trains',
    ])
  })

  test('a group takes every one of its members with it', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 1, to: 0 }))

    expect(move?.order).toEqual([
      'sample.type',
      'sample.x',
      'sample.y',
      'n_trains',
      'scan_type',
    ])
  })

  test('a member moves within its own group and nowhere else', () => {
    const move = reorder(
      drop({ list: membersDroppable('sample'), from: 2, to: 0 })
    )

    expect(move?.order).toEqual([
      'n_trains',
      'sample.y',
      'sample.type',
      'sample.x',
      'scan_type',
    ])
  })

  test('an ungrouped column drop names only itself and no group', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 0, to: 2 }))

    expect(move?.moved).toEqual({ columns: ['n_trains'], groups: [] })
  })

  test('a group drop names the group and every one of its members as moved', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 1, to: 0 }))

    expect(move?.moved).toEqual({
      columns: ['sample.type', 'sample.x', 'sample.y'],
      groups: ['sample'],
    })
  })

  test('a member drop names only that member as moved', () => {
    const move = reorder(
      drop({ list: membersDroppable('sample'), from: 2, to: 0 })
    )

    expect(move?.moved).toEqual({ columns: ['sample.y'], groups: [] })
  })

  test('a column dropped back where it started writes nothing', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 1, to: 1 }))

    expect(move).toBeNull()
  })

  test('a column dropped outside the list writes nothing', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 0, to: null }))

    expect(move).toBeNull()
  })
})

describe('reorderColumns under a search', () => {
  test('a column dropped below a match lands beside it, past the hidden rows', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 0, to: 1 }), {
      search: 'n',
    })

    expect(move?.order).toEqual([
      'sample.type',
      'sample.x',
      'sample.y',
      'scan_type',
      'n_trains',
    ])
  })

  test('a column dropped at the top leads the match that was there', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 1, to: 0 }), {
      search: 'n',
    })

    expect(move?.order).toEqual([
      'scan_type',
      'n_trains',
      'sample.type',
      'sample.x',
      'sample.y',
    ])
  })

  test('a group moves with the members the search took off screen', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 0, to: 1 }), {
      search: 'type',
    })

    expect(move?.order).toEqual([
      'n_trains',
      'scan_type',
      'sample.type',
      'sample.x',
      'sample.y',
    ])
  })

  test('a group drop names the members the search took off screen as moved', () => {
    const move = reorder(drop({ list: BLOCKS_DROPPABLE, from: 0, to: 1 }), {
      search: 'type',
    })

    expect(move?.moved).toEqual({
      columns: ['sample.type', 'sample.x', 'sample.y'],
      groups: ['sample'],
    })
  })

  test('a member moves within its group and leaves the hidden ones alone', () => {
    const move = reorder(
      drop({ list: membersDroppable('sample'), from: 1, to: 0 }),
      { search: '[mm]' }
    )

    expect(move?.order).toEqual([
      'n_trains',
      'sample.type',
      'sample.y',
      'sample.x',
      'scan_type',
    ])
  })
})
