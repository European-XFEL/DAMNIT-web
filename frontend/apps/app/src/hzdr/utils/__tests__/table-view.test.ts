import { describe, it, expect, beforeEach } from 'vitest'
import {
  SHOT_TABLE_COLUMNS,
  SHOT_TABLE_COLUMN_WIDTHS,
  CONTEXT_COLUMN_WIDTH,
  loadShotTableView,
  saveShotTableView,
} from '../table-view'
import type { ShotTableView } from '../table-view'

const SOURCE_KEY = 'test-source'
const STORAGE_KEY = `hzdr:shot-table-view:${SOURCE_KEY}`

function makeView(overrides: Partial<ShotTableView> = {}): ShotTableView {
  return {
    filterColumn: 'status',
    filterOperator: 'equals',
    filterValue: 'ok',
    sortState: { column: 'fired_at', direction: 'desc' },
    hiddenTableColumns: ['target'],
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('saveShotTableView / loadShotTableView', () => {
  it('round-trips a saved view', () => {
    const view = makeView()
    saveShotTableView(SOURCE_KEY, view)
    expect(loadShotTableView(SOURCE_KEY)).toEqual(view)
  })

  it('keeps views separate per source key', () => {
    saveShotTableView('source-a', makeView({ filterValue: 'a' }))
    saveShotTableView('source-b', makeView({ filterValue: 'b' }))
    expect(loadShotTableView('source-a')?.filterValue).toBe('a')
    expect(loadShotTableView('source-b')?.filterValue).toBe('b')
  })

  it('returns undefined when nothing is stored', () => {
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()
  })

  it('returns undefined for malformed JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()
  })

  it('returns undefined for non-object payloads', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify('a string'))
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]))
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(null))
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()
  })

  it('rejects an invalid filter operator', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(makeView({ filterOperator: 'matches' as never }))
    )
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()
  })

  it('rejects an invalid sort direction', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        makeView({
          sortState: { column: 'shot_number', direction: 'up' } as never,
        })
      )
    )
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()
  })

  it('rejects a missing or malformed sortState', () => {
    const { sortState: _dropped, ...withoutSort } = makeView()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutSort))
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(makeView({ sortState: 'asc' as never }))
    )
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()
  })

  it('rejects non-string hidden column entries', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(makeView({ hiddenTableColumns: ['target', 7] as never }))
    )
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(makeView({ hiddenTableColumns: 'target' as never }))
    )
    expect(loadShotTableView(SOURCE_KEY)).toBeUndefined()
  })
})

describe('SHOT_TABLE_COLUMNS', () => {
  // Characterization: the spec must keep producing exactly the option lists
  // and widths that were previously hand-written in ShotPage.tsx.
  it('derives the previous table column options', () => {
    expect(
      SHOT_TABLE_COLUMNS.map(({ value, label }) => ({ value, label }))
    ).toEqual([
      { value: 'shot_number', label: 'Shot' },
      { value: 'shot_day', label: 'Day' },
      { value: 'fired_at', label: 'Fired at' },
      { value: 'status', label: 'Status' },
      { value: 'laser_energy_j', label: 'Energy' },
      { value: 'target', label: 'Target' },
    ])
  })

  it('keeps the previous cell widths', () => {
    expect(SHOT_TABLE_COLUMN_WIDTHS).toEqual({
      shot_number: 86,
      shot_day: 92,
      fired_at: 168,
      status: 112,
      laser_energy_j: 96,
      target: 146,
    })
    expect(CONTEXT_COLUMN_WIDTH).toBe(180)
  })
})
