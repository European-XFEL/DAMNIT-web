import { isHeavyBlank } from '#src/constants'

import type { Cell, Run, RunCells, RunId, Variable } from './table-data.types'

// A value the server is still holding back on the table's first pass, rather
// than one that is genuinely absent. Shares its rule with the cache merge policy
// through `isHeavyBlank`, so the two cannot disagree on what is still to come.
function isDeferred(cell: Cell): boolean {
  return isHeavyBlank({
    value: cell.value,
    error: cell.error,
    dtype: cell.dtype,
  })
}

// The cells worth a second, heavier fetch: the ones @lightweight held back.
export function heavyCellNames(runs: Run[]): string[] {
  const names = new Set<string>()

  for (const run of runs) {
    for (const cell of run.cells) {
      if (isDeferred(cell)) {
        names.add(cell.name)
      }
    }
  }

  return [...names]
}

// The identity a run is looked up by: (proposal, run). The database is constant
// across a table, so the client keys only on the pair, which is enough to keep
// runs that share a number across proposals apart.
export function runKey({ proposal, run }: RunId): string {
  return `${proposal}:${run}`
}

// One run's cells keyed by variable name, for O(1) lookup. Shared by the grid
// index and the run-detail aside so both key a run's cells the same way.
export function cellsByName(cells: Cell[]): RunCells {
  const byName: RunCells = {}
  for (const cell of cells) {
    byName[cell.name] = cell
  }
  return byName
}

// A live push gives a new `runs` array but reuses the object of every unchanged
// run (Apollo's result caching), so this WeakMap hands back that run's
// already-built cell map and only the changed runs are rebuilt. A proposal can
// hold thousands of runs while a push touches a handful. The reuse is within one
// watched query's re-broadcasts: a separate query over the same runs gets its
// own object refs, since Apollo does not canonicalize across queries, so it
// rebuilds its own entries. Entries drop out when Apollo releases the run object.
const cellsByRun = new WeakMap<Run, RunCells>()

// Index the runs payload into a per-identity cell map the grid reads by lookup.
export function indexRunCells(runs: Run[]): Map<string, RunCells> {
  const byIdentity = new Map<string, RunCells>()
  for (const run of runs) {
    let cells = cellsByRun.get(run)
    if (cells === undefined) {
      cells = cellsByName(run.cells)
      cellsByRun.set(run, cells)
    }
    byIdentity.set(runKey(run), cells)
  }
  return byIdentity
}

export function getVariableTitle(variable: Variable): string {
  return variable.title || variable.name
}
