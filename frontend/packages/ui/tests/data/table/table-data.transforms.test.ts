import { describe, expect, test } from 'vitest'

import {
  flattenRuns,
  heavyVariableNames,
} from '#src/data/table/table-data.transforms'
import type { VariableError, VariableValue } from '#src/types'

function variable(
  name: string,
  value: VariableValue,
  dtype = 'number',
  error: VariableError | null = null
) {
  return { name, value, dtype, error }
}

describe('flattenRuns', () => {
  test('keys each row by its run variable value', () => {
    const table = flattenRuns([
      { variables: [variable('run', 5), variable('energy', 1.2)] },
      { variables: [variable('run', 9), variable('energy', 3.4)] },
    ])

    expect(Object.keys(table)).toEqual(['5', '9'])
    expect(table['5'].energy).toEqual({
      value: 1.2,
      dtype: 'number',
      error: undefined,
    })
  })

  test('skips a run that has no run variable', () => {
    const table = flattenRuns([{ variables: [variable('energy', 1.2)] }])
    expect(table).toEqual({})
  })

  // The guard is `value == null`, so a missing run value is skipped the same
  // way whether it arrives as null (as GraphQL delivers it) or undefined.
  test('skips a run whose run value is missing', () => {
    expect(flattenRuns([{ variables: [variable('run', undefined)] }])).toEqual(
      {}
    )
    expect(
      flattenRuns([
        { variables: [variable('run', null as unknown as VariableValue)] },
      ])
    ).toEqual({})
  })

  test('maps a variable to its value, dtype and error', () => {
    const error = { cls: 'ValueError', message: 'boom' }
    const table = flattenRuns([
      { variables: [variable('run', 1), variable('x', 2, 'number', error)] },
    ])
    expect(table['1'].x).toEqual({ value: 2, dtype: 'number', error })
  })

  test('collapses a null error to undefined', () => {
    const table = flattenRuns([
      { variables: [variable('run', 1), variable('x', 2, 'number', null)] },
    ])
    expect(table['1'].x.error).toBeUndefined()
  })
})

// A heavy value the @lightweight directive held back: the server sends the
// variable with its value nulled out.
const blanked = (name: string, error: VariableError | null = null) =>
  variable(name, null as unknown as VariableValue, 'array', error)

describe('heavyVariableNames', () => {
  test('names the blanked variables worth a second fetch', () => {
    const rows = flattenRuns([
      {
        variables: [
          variable('run', 1),
          variable('energy', 1.2),
          blanked('spectrum'),
        ],
      },
    ])

    expect(heavyVariableNames(rows)).toEqual(['spectrum'])
  })

  test('leaves out a variable that failed rather than being held back', () => {
    // A blank carrying an error is a variable that genuinely has no value, so
    // fetching it again would only return the same error.
    const rows = flattenRuns([
      {
        variables: [
          variable('run', 1),
          blanked('broken', { cls: 'ValueError', message: 'boom' }),
        ],
      },
    ])

    expect(heavyVariableNames(rows)).toEqual([])
  })

  test('names a variable once however many runs blanked it', () => {
    const rows = flattenRuns([
      { variables: [variable('run', 1), blanked('spectrum')] },
      { variables: [variable('run', 2), blanked('spectrum')] },
    ])

    expect(heavyVariableNames(rows)).toEqual(['spectrum'])
  })
})
