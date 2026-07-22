import type {
  Cell,
  CellError,
  CellValue,
  TableData,
  Variable,
} from './table-data.types'

type DamnitCell = {
  name: string
  value: CellValue
  dtype: string
  error?: CellError | null
}

export type DamnitRun = {
  cells: DamnitCell[]
}

// A value the server blanked rather than one that is genuinely absent. The
// @lightweight directive nulls heavy values (images, arrays) so a page's rows
// land fast, which leaves them looking like a cell with no value. The one
// tell is that a real failure carries an error, so the errorless blanks are the
// ones the server is still holding back.
export function isBlanked(cell: Cell | undefined): boolean {
  return cell?.value == null && cell?.error == null
}

// The variables worth a second, heavier fetch: the ones whose cells
// @lightweight blanked, in any row.
export function heavyVariableNames(data: TableData): string[] {
  const names = new Set<string>()

  for (const row of Object.values(data)) {
    for (const [name, cell] of Object.entries(row)) {
      if (isBlanked(cell)) {
        names.add(name)
      }
    }
  }

  return [...names]
}

// Turn the GraphQL runs payload into the table's run-keyed row map. Each run is
// keyed by its `run` cell's value; a run with no `run` cell, or a null run
// value, is skipped. A cell's null error collapses to undefined.
export function flattenRuns(runs: DamnitRun[]): TableData {
  const table: TableData = {}

  for (const run of runs) {
    const runCell = run.cells.find((c) => c.name === 'run')
    if (runCell === undefined || runCell.value == null) {
      continue
    }

    const row: Record<string, Cell> = {}
    for (const cell of run.cells) {
      row[cell.name] = {
        value: cell.value,
        dtype: cell.dtype,
        error: cell.error ?? undefined,
      }
    }

    table[String(runCell.value)] = row
  }

  return table
}

export function getVariableTitle(variable: Variable): string {
  return variable.title || variable.name
}
