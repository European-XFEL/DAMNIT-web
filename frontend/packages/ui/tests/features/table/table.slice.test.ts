import { describe, expect, test } from 'vitest'

import reducer, {
  clearTagSelection,
  selectRun,
  setTagSelection,
  setVariableVisibility,
} from '#src/features/table/table.slice'

describe('selectRun', () => {
  test('sets the run and its variables', () => {
    const state = reducer(
      undefined,
      selectRun({ run: 5, variables: ['a', 'b'] })
    )
    expect(state.selection.run).toBe(5)
    expect(state.selection.variables).toEqual(['a', 'b'])
  })

  // Referential stability is the contract: a redundant dispatch must keep the
  // exact same variables array, which is what the isArrayEqual guard buys us.
  test('keeps the same variables array reference on a redundant dispatch', () => {
    const first = reducer(
      undefined,
      selectRun({ run: 5, variables: ['a', 'b'] })
    )
    const second = reducer(first, selectRun({ run: 5, variables: ['a', 'b'] }))
    expect(second.selection.variables).toBe(first.selection.variables)
  })
})

describe('setVariableVisibility', () => {
  test('sets one variable without clobbering its siblings', () => {
    let state = reducer(undefined, setVariableVisibility({ a: true, b: true }))
    state = reducer(state, setVariableVisibility({ a: false }))
    expect(state.variables.a).toEqual({ visibility: false })
    expect(state.variables.b).toEqual({ visibility: true })
  })
})

describe('setTagSelection', () => {
  test('merges a selection without clobbering the others', () => {
    let state = reducer(undefined, setTagSelection({ hot: true, cold: true }))
    state = reducer(state, setTagSelection({ hot: false }))
    expect(state.tags.hot).toEqual({ isSelected: false })
    expect(state.tags.cold).toEqual({ isSelected: true })
  })
})

describe('clearTagSelection', () => {
  test('deselects every tag while preserving the keys', () => {
    let state = reducer(undefined, setTagSelection({ hot: true, cold: true }))
    state = reducer(state, clearTagSelection())
    expect(state.tags).toEqual({
      hot: { isSelected: false },
      cold: { isSelected: false },
    })
  })
})
