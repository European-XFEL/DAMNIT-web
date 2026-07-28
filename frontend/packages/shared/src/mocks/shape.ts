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

// The server's cell id, built the same way `DamnitRun._iter_cells` builds it.
// Apollo keys `Cell` on it, so anything that spells it differently mints a
// second entity for the same cell. `database` leads and is not the proposal: a
// guest run is served through one database and reports another proposal.
export function cellId({ database, proposal, run, name }: CellIdParts): string {
  return `${database}:${proposal}:${run}:${name}`
}

// One cell's wire object. Shared by the query mock and the subscription mock so
// the composite `Cell` shape stays identical on both paths. `error` is always
// sent, even absent from the example: the query selects it, so omitting it
// leaves the client's cache read incomplete and every cached replay silently
// refetches. `lightweight` blanks a heavy value the way the real @lightweight
// pass does.
function shapeCell(
  name: string,
  cell: RunData['variables'][string],
  { database, proposal, run, lightweight = false }: ShapeCellOptions
) {
  return {
    __typename: 'Cell',
    id: cellId({ database, proposal, run, name }),
    name,
    error: 'error' in cell ? { __typename: 'CellError', ...cell.error } : null,
    summary: {
      __typename: 'CellSummary',
      value: lightweight && HEAVY_DTYPES.has(cell.dtype) ? null : cell.value,
      dtype: cell.dtype,
    },
  }
}

// One run's wire object: the identity trio Apollo keys the run by, plus cells
// whose ids are built from that same trio. Shared by the query mock and the
// subscription mock, so the two cannot disagree on how a run and its cells are
// keyed, and a live push lands on the run the table already holds.
export function shapeRun(
  variables: RunData['variables'],
  options: ShapeRunOptions
) {
  const { database, proposal, run, names } = options
  return {
    __typename: 'DamnitRun',
    database,
    proposal,
    run,
    cells: Object.entries(variables)
      .filter(([name]) => names == null || names.includes(name))
      .map(([name, cell]) => shapeCell(name, cell, options)),
  }
}

export function shapeTableData(
  data: RunData[],
  { proposal, names, lightweight = false }: ShapeTableDataOptions
) {
  return {
    runs: data.map((run) =>
      shapeRun(run.variables, {
        // `database` is the addressing handle the client sent; the examples are
        // single-proposal, so a run's own proposal is the queried one too.
        database: proposal,
        proposal,
        // The logical run number the metadata list and the grid rows use, not
        // the physical source run number: in the xpcs example, runs 1 to 6 come
        // from source runs 6, 7, 11, 33, 34 and 35. Take the wrong one and the
        // run and every one of its cells key to a row no grid reads.
        run: Number(run.variables.run?.value ?? run.source.run_number),
        names,
        lightweight,
      })
    ),
  }
}

type CellIdParts = {
  database: string
  proposal: string
  run: number
  name: string
}

type ShapeCellOptions = {
  database: string
  proposal: string
  run: number
  lightweight?: boolean
}

// A run takes everything a cell takes, because it forwards the bag straight
// through, plus the name filter that only makes sense over a whole run.
type ShapeRunOptions = ShapeCellOptions & {
  names?: string[] | null
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
