// `boolean` has no renderer of its own and falls back to text, but the API's
// `Any` scalar does emit one, so leaving it out would only hide it.
export type CellValue = string | number | boolean | number[] | null | undefined

export type CellError = {
  message: string
  cls: string
}

// The table-value facet of a cell: the summary the grid renders.
export type CellSummary = {
  value: CellValue
  dtype: string
}

// One run's cell in one variable. `id` ("{database}:{proposal}:{run}:{name}") is
// the Apollo cache key; `name` ties the cell to its variable.
export type Cell = {
  id: string
  name: string
  error?: CellError | null
  summary: CellSummary
}

// A column: what a variable is, independent of any run's value of it.
export type Variable = {
  name: string
  title?: string
  tags: string[]
}

export type Tag = {
  id: number
  name: string
  variables: string[]
}

// A run row. Its identity is the (database, proposal, run) trio, which the cache
// keys on: run numbers collide across proposals in one file, so all three are
// needed to key a run.
export type Run = {
  database: string
  proposal: string
  run: number
  cells: Cell[]
}

// The (proposal, run) pair the grid lays out and looks up by. The database is
// constant across a table, so the pair keeps runs that share a number across
// proposals apart.
export type RunId = {
  proposal: string
  run: number
}

// One run's cells keyed by variable name, for O(1) cell lookup.
export type RunCells = Record<string, Cell>

// The table's shape: its columns, row order, tags, and freshness.
export type TableMeta = {
  variables: Record<string, Variable>
  runs: RunId[]
  tags: Record<string, Tag>
  timestamp: number
}
