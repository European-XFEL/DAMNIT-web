import { describe, expect, test } from 'vitest'

import reducer, {
  addTab,
  removeTab,
  setCurrentTab,
} from '@/features/dashboard/dashboard.slice'

describe('setCurrentTab', () => {
  test('activates a tab and records the previous one', () => {
    const state = reducer(undefined, setCurrentTab('editor'))
    expect(state.main.currentTab).toBe('editor')
    expect(state.main.previousTab).toBe('table')
  })

  test('ignores an unknown or unchanged tab', () => {
    let state = reducer(undefined, setCurrentTab('editor'))
    state = reducer(state, setCurrentTab('does-not-exist'))
    expect(state.main.currentTab).toBe('editor')

    state = reducer(state, setCurrentTab('editor'))
    expect(state.main.previousTab).toBe('table')
  })
})

describe('addTab', () => {
  test('adds a tab, activates it and tracks the previous one', () => {
    const state = reducer(undefined, addTab({ id: 'run5', title: 'Run 5' }))
    expect(state.main.currentTab).toBe('run5')
    expect(state.main.previousTab).toBe('table')
    expect(state.main.tabs.run5).toEqual({ title: 'Run 5' })
  })
})

describe('removeTab', () => {
  test('falls back to the previous tab when removing the current one', () => {
    let state = reducer(undefined, setCurrentTab('editor'))
    state = reducer(state, removeTab('editor'))
    expect(state.main.currentTab).toBe('table')
    expect(state.main.tabs.editor).toBeUndefined()
  })

  test('falls back to the last remaining tab when there is no previous', () => {
    const state = reducer(undefined, removeTab('table'))
    expect(state.main.currentTab).toBe('editor')
  })

  test('clears previousTab when that tab is the one removed', () => {
    let state = reducer(undefined, addTab({ id: 'run5', title: 'Run 5' }))
    state = reducer(state, removeTab('table'))
    expect(state.main.previousTab).toBeUndefined()
    expect(state.main.currentTab).toBe('run5')
    expect(state.main.tabs.table).toBeUndefined()
  })
})
