import type { TableData } from './table-data.types'
import type {
  VariableDataItem,
  VariableError,
  VariableValue,
} from '../../types'

type DamnitVariable = {
  name: string
  value: VariableValue
  dtype: string
  error?: VariableError | null
}

export type DamnitRun = {
  variables: DamnitVariable[]
}

// Turn the GraphQL runs payload into the table's run-keyed row map. Each run is
// keyed by its `run` variable's value; a run with no `run` variable, or a null
// run value, is skipped. A variable's null error collapses to undefined.
export function flattenRuns(runs: DamnitRun[]): TableData {
  const table: TableData = {}

  for (const run of runs) {
    const runVariable = run.variables.find((v) => v.name === 'run')
    if (runVariable === undefined || runVariable.value == null) {
      continue
    }

    const row: Record<string, VariableDataItem> = {}
    for (const variable of run.variables) {
      row[variable.name] = {
        value: variable.value,
        dtype: variable.dtype,
        error: variable.error ?? undefined,
      }
    }

    table[String(runVariable.value)] = row
  }

  return table
}
