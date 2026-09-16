import { describe, expect, test } from 'vitest'

import reducer, {
  cellActivated,
  clearTagSelection,
  columnMoved,
  columnOrderReset,
  columnResized,
  columnWidthsReset,
  runDeselected,
  runSelected,
  setColumnVisibility,
  setTagSelection,
} from '#src/features/table/stores/table.slice'

describe('runSelected', () => {
  test('selects the run by its identity and shows every variable', () => {
    const state = reducer(
      undefined,
      runSelected({ proposal: '900485', run: 5 })
    )
    expect(state.rowSelection).toEqual({ '900485:5': true })
    expect(state.activeVariable).toBeNull()
  })

  // The proposal disambiguates a run number that collides across proposals, so
  // the same number under a different proposal is a distinct selection.
  test('replaces a selected run of the same number from another proposal', () => {
    // Select the active proposal's run 5.
    let state = reducer(undefined, runSelected({ proposal: '900485', run: 5 }))
    expect(state.rowSelection).toEqual({ '900485:5': true })

    // Select a guest proposal's run of the same number.
    state = reducer(state, runSelected({ proposal: '888888', run: 5 }))
    expect(state.rowSelection).toEqual({ '888888:5': true })
  })

  // Clicking a row after drilling into a cell widens the aside back out. It used
  // to fall out of an absent payload key, so it is asserted rather than assumed.
  test('clears the variable a cell was drilled into', () => {
    let state = reducer(
      undefined,
      cellActivated({ proposal: '900485', run: 5, variable: 'motor' })
    )
    state = reducer(state, runSelected({ proposal: '900485', run: 5 }))
    expect(state.activeVariable).toBeNull()
  })

  // Referential stability is the contract: glide is handed a selection rebuilt
  // from this map, so a redundant dispatch must not churn it.
  test('keeps the same row selection reference on a redundant dispatch', () => {
    const first = reducer(
      undefined,
      runSelected({ proposal: '900485', run: 5 })
    )
    const second = reducer(first, runSelected({ proposal: '900485', run: 5 }))
    expect(second.rowSelection).toBe(first.rowSelection)
  })
})

describe('runDeselected', () => {
  test('empties the row selection and shows every variable', () => {
    let state = reducer(
      undefined,
      cellActivated({ proposal: '900485', run: 5, variable: 'motor' })
    )
    state = reducer(state, runDeselected())
    expect(state.rowSelection).toEqual({})
    expect(state.activeVariable).toBeNull()
  })
})

describe('cellActivated', () => {
  test('selects the run its cell belongs to and drills into the variable', () => {
    const state = reducer(
      undefined,
      cellActivated({ proposal: '900485', run: 5, variable: 'motor' })
    )
    expect(state.rowSelection).toEqual({ '900485:5': true })
    expect(state.activeVariable).toBe('motor')
  })
})

describe('setColumnVisibility', () => {
  test('sets one column without clobbering its siblings', () => {
    let state = reducer(undefined, setColumnVisibility({ a: true, b: true }))
    state = reducer(state, setColumnVisibility({ a: false }))
    expect(state.columnVisibility.a).toBe(false)
    expect(state.columnVisibility.b).toBe(true)
  })

  // The proposal column is the one the table hides by default, and it is the
  // seed rather than a read-time rule that keeps it hidden.
  test('seeds the proposal column hidden and nothing else', () => {
    const state = reducer(undefined, { type: 'unknown' })
    expect(state.columnVisibility).toEqual({ proposal: false })
  })
})

describe('columnPinning', () => {
  // Nothing pins or unpins, so the seed is the whole feature: the grid reads it
  // to decide which leading columns to freeze.
  test('seeds the identity columns pinned to the start, proposal first', () => {
    const state = reducer(undefined, { type: 'unknown' })
    expect(state.columnPinning).toEqual({ start: ['proposal', 'run'], end: [] })
  })
})

describe('columnMoved', () => {
  test('writes the order and stamps the columns the drop moved', () => {
    const state = reducer(
      undefined,
      columnMoved({
        order: ['b', 'a', 'c'],
        moved: { columns: ['b'], groups: [] },
      })
    )
    expect(state.columnOrder).toEqual(['b', 'a', 'c'])
    expect(state.lastFlash).toEqual({
      columns: ['b'],
      groups: [],
      at: expect.any(Number),
    })
  })

  test('adds each drop to what has moved since the last reset', () => {
    let state = reducer(
      undefined,
      columnMoved({
        order: ['b', 'a', 'g.x', 'g.y'],
        moved: { columns: ['b'], groups: [] },
      })
    )
    state = reducer(
      state,
      columnMoved({
        order: ['g.x', 'g.y', 'b', 'a'],
        moved: { columns: ['g.x', 'g.y'], groups: ['g'] },
      })
    )
    state = reducer(
      state,
      columnMoved({
        order: ['g.x', 'g.y', 'a', 'b'],
        moved: { columns: ['b'], groups: [] },
      })
    )

    expect(state.movedSinceReset).toEqual({
      columns: ['b', 'g.x', 'g.y'],
      groups: ['g'],
    })
  })
})

describe('columnOrderReset', () => {
  test('stamps everything moved since the last reset and starts the list over', () => {
    let state = reducer(
      undefined,
      columnMoved({
        order: ['b', 'a', 'g.x', 'g.y'],
        moved: { columns: ['b'], groups: [] },
      })
    )
    state = reducer(
      state,
      columnMoved({
        order: ['g.x', 'g.y', 'b', 'a'],
        moved: { columns: ['g.x', 'g.y'], groups: ['g'] },
      })
    )

    state = reducer(state, columnOrderReset())
    expect(state.columnOrder).toEqual([])
    expect(state.lastFlash).toEqual({
      columns: ['b', 'g.x', 'g.y'],
      groups: ['g'],
      at: expect.any(Number),
    })
    expect(state.movedSinceReset).toEqual({ columns: [], groups: [] })
  })

  test('a reset with nothing moved stamps nothing', () => {
    const state = reducer(undefined, columnOrderReset())

    expect(state.lastFlash).toBeNull()
  })
})

describe('columnResized', () => {
  test('resizes one column without clobbering its siblings', () => {
    let state = reducer(undefined, columnResized({ variable: 'a', width: 240 }))
    state = reducer(state, columnResized({ variable: 'b', width: 60 }))
    expect(state.columnSizing).toEqual({ a: 240, b: 60 })
  })
})

describe('columnWidthsReset', () => {
  test('drops every width the user set', () => {
    let state = reducer(undefined, columnResized({ variable: 'a', width: 240 }))
    state = reducer(state, columnWidthsReset({ columns: [], groups: [] }))
    expect(state.columnSizing).toEqual({})
  })
})

describe('setTagSelection', () => {
  test('merges a selection without clobbering the others', () => {
    let state = reducer(undefined, setTagSelection({ hot: true, cold: true }))
    state = reducer(state, setTagSelection({ hot: false }))
    expect(state.tagSelection.hot).toBe(false)
    expect(state.tagSelection.cold).toBe(true)
  })
})

describe('clearTagSelection', () => {
  test('deselects every tag', () => {
    let state = reducer(undefined, setTagSelection({ hot: true, cold: true }))
    state = reducer(state, clearTagSelection())
    expect(state.tagSelection).toEqual({})
  })
})
