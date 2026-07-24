import { HEAVY_DTYPES } from '../constants'

import type { Meta, RunData } from './types'

// The app's REST surfaces (auth and context file), as BASE_URL-relative path
// prefixes. Both mock guards fail loudly on any of these they don't cover, so
// mock drift surfaces immediately instead of as a silently broken page.
export const REST_API_PREFIXES = ['oauth/', 'contextfile/']

// The metadata snapshot for one proposal. `runs` is a list of (proposal, run)
// pairs, server-ordered; the examples are single-proposal, so every pair takes
// the queried proposal. `__typename` rides on every object so Apollo can
// normalize the runs the same way the real server lets it.
export function shapeMetadata(meta: Meta, proposal: string) {
  return {
    __typename: 'TableMeta',
    variables: meta.variables,
    runs: meta.runs.map((run) => ({
      __typename: 'RunId',
      proposal,
      run,
    })),
    timestamp: 0,
    tags: meta.tags,
  }
}

// One cell's wire object. Shared by the query mock and the subscription mock so
// the `Cell`/`CellError` shape stays identical on both paths. `error` is always
// sent, even absent from the example: the query selects it, so omitting it
// leaves the client's cache read incomplete and every cached replay silently
// refetches. `lightweight` blanks a heavy value the way the real @lightweight
// pass does.
export function shapeCell(
  name: string,
  cell: RunData['variables'][string],
  { lightweight = false }: { lightweight?: boolean } = {}
) {
  return {
    __typename: 'Cell',
    name,
    value: lightweight && HEAVY_DTYPES.has(cell.dtype) ? null : cell.value,
    dtype: cell.dtype,
    error: 'error' in cell ? { __typename: 'CellError', ...cell.error } : null,
  }
}

export function shapeTableData(
  data: RunData[],
  { proposal, names, lightweight = false }: ShapeTableDataOptions
) {
  return {
    runs: data.map((run) => ({
      // The identity trio, so Apollo keys the run by (database, proposal, run).
      // `database` is the addressing handle the client sent; the examples are
      // single-proposal, so a run's own proposal is the queried one too. The
      // run is the `run` variable's value (the logical number the metadata run
      // list uses), not the physical source run number.
      __typename: 'DamnitRun',
      database: proposal,
      proposal,
      run: Number(run.variables.run?.value ?? run.source.run_number),
      cells: Object.entries(run.variables)
        .filter(([name]) => names == null || names.includes(name))
        .map(([name, cell]) => shapeCell(name, cell, { lightweight })),
    })),
  }
}

type ShapeTableDataOptions = {
  proposal: string
  names?: string[] | null
  lightweight?: boolean
}

// A GraphQL error response (not a network error) surfaces mock drift
// immediately without tripping Apollo's RetryLink into an endless retry.
export function unmockedOperationError(operationName: string) {
  return { errors: [{ message: `Unmocked operation: ${operationName}` }] }
}
