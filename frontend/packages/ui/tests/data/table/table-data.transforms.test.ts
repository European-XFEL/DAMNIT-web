import { describe, expect, test } from 'vitest'

import { flattenRuns } from '@/data/table/table-data.transforms'
import type { VariableError, VariableValue } from '@/types'

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
