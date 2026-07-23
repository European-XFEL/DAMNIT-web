import { describe, expect, test } from 'vitest'

import {
  flattenRuns,
  heavyVariableNames,
} from '#src/data/table/table-data.transforms'
import type { CellError, CellValue } from '#src/data/table/table-data.types'

function cell(
  name: string,
  value: CellValue,
  dtype = 'number',
  error: CellError | null = null
) {
  return { name, value, dtype, error }
}

describe('flattenRuns', () => {
  test('keys each row by its run cell value', () => {
    const table = flattenRuns([
      { cells: [cell('run', 5), cell('energy', 1.2)] },
      { cells: [cell('run', 9), cell('energy', 3.4)] },
    ])

    expect(Object.keys(table)).toEqual(['5', '9'])
    expect(table['5'].energy).toEqual({
      value: 1.2,
      dtype: 'number',
      error: undefined,
    })
  })

  test('skips a run that has no run variable', () => {
    const table = flattenRuns([{ cells: [cell('energy', 1.2)] }])
    expect(table).toEqual({})
  })

  // The guard is `value == null`, so a missing run value is skipped the same
  // way whether it arrives as null (as GraphQL delivers it) or undefined.
  test('skips a run whose run value is missing', () => {
    expect(flattenRuns([{ cells: [cell('run', undefined)] }])).toEqual({})
    expect(flattenRuns([{ cells: [cell('run', null)] }])).toEqual({})
  })

  test('maps a variable to its value, dtype and error', () => {
    const error = { cls: 'ValueError', message: 'boom' }
    const table = flattenRuns([
      { cells: [cell('run', 1), cell('x', 2, 'number', error)] },
    ])
    expect(table['1'].x).toEqual({ value: 2, dtype: 'number', error })
  })

  test('collapses a null error to undefined', () => {
    const table = flattenRuns([
      { cells: [cell('run', 1), cell('x', 2, 'number', null)] },
    ])
    expect(table['1'].x.error).toBeUndefined()
  })
})

// A heavy value the @lightweight directive held back: the server sends the
// variable with its value nulled out.
const blanked = (name: string, error: CellError | null = null) =>
  cell(name, null, 'array', error)

describe('heavyVariableNames', () => {
  test('names the blanked cells worth a second fetch', () => {
    const rows = flattenRuns([
      {
        cells: [cell('run', 1), cell('energy', 1.2), blanked('spectrum')],
      },
    ])

    expect(heavyVariableNames(rows)).toEqual(['spectrum'])
  })

  test('leaves out a variable that failed rather than being held back', () => {
    // A blank carrying an error is a variable that genuinely has no value, so
    // fetching it again would only return the same error.
    const rows = flattenRuns([
      {
        cells: [
          cell('run', 1),
          blanked('broken', { cls: 'ValueError', message: 'boom' }),
        ],
      },
    ])

    expect(heavyVariableNames(rows)).toEqual([])
  })

  test('names a variable once however many runs blanked it', () => {
    const rows = flattenRuns([
      { cells: [cell('run', 1), blanked('spectrum')] },
      { cells: [cell('run', 2), blanked('spectrum')] },
    ])

    expect(heavyVariableNames(rows)).toEqual(['spectrum'])
  })
})
