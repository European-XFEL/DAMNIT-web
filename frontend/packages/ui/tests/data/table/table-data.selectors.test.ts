import { describe, expect, test } from 'vitest'

import { selectVariables } from '#src/data/table/table-data.selectors'
import type { RootState } from '#src/redux/reducer'
import type { VariableMetadataItem } from '#src/types'

function stateWithVariables(names: string[]): RootState {
  const variables: Record<string, VariableMetadataItem> = Object.fromEntries(
    names.map((name) => [name, { name, tags: [] }])
  )
  return { tableData: { metadata: { variables } } } as unknown as RootState
}

describe('selectVariables', () => {
  // EXCLUDED_VARIABLES is ['proposal', 'added_at'] only. Note that 'run' is
  // NOT excluded here (it is plottable), unlike the column-visibility hook's
  // NONCONFIGURABLE_VARIABLES, which also drops 'run'.
  test('drops proposal and added_at but keeps run', () => {
    const state = stateWithVariables(['proposal', 'added_at', 'run', 'energy'])
    expect(selectVariables(state).map((variable) => variable.name)).toEqual([
      'run',
      'energy',
    ])
  })
})
