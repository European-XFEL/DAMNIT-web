import type { VariableDataItem, VariableError, VariableValue } from '#src/types'

import type { TableData } from './table-data.types'

type DamnitVariable = {
  name: string
  value: VariableValue
  dtype: string
  error?: VariableError | null
}

export type DamnitRun = {
  variables: DamnitVariable[]
}

// A value the server blanked rather than one that is genuinely absent. The
// @lightweight directive nulls heavy values (images, arrays) so a page's rows
// land fast, which leaves them looking like a variable with no value. The one
// tell is that a real failure carries an error, so the errorless blanks are the
// ones the server is still holding back.
export function isBlanked(variable: VariableDataItem | undefined): boolean {
  return variable?.value == null && variable?.error == null
}

// The variables worth a second, heavier fetch: the ones @lightweight blanked.
export function heavyVariableNames(data: TableData): string[] {
  const names = new Set<string>()

  for (const row of Object.values(data)) {
    for (const [name, variable] of Object.entries(row)) {
      if (isBlanked(variable)) {
        names.add(name)
      }
    }
  }

  return [...names]
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
