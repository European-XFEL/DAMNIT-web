import { gql } from '@apollo/client'

import {
  DEFERRED_TABLE_DATA_QUERY_NAME,
  TABLE_DATA_QUERY_NAME,
} from './table-data.constants'
import { type Run, type TableMeta } from './table-data.types'

/*
 * -----------------------------
 *   Runs
 * -----------------------------
 */

// The cell selection every runs document shares. A field added to one copy but
// not the others leaves the documents drifting apart over the same cache entry,
// so the shape lives in one place.
const CELL_FIELDS = `
  name
  value
  dtype
  error {
    message
    cls
  }
`

// Every run carries its identity trio (database, proposal, run) so Apollo can
// normalize it: the cache keys a run by all three, since run numbers collide
// across proposals in one file.
const RUN_CELLS = `
  database
  proposal
  run
  cells(names: $names) {
    ${CELL_FIELDS}
  }
`

// The same run shape without the `names` argument: every cell the run has. The
// subscription and the run-detail fragment both read the whole merged bag.
const RUN_ALL_CELLS = `
  database
  proposal
  run
  cells {
    ${CELL_FIELDS}
  }
`

// Reads one normalized run straight from the cache, for the run-detail aside.
export const RUN_FRAGMENT = gql`
  fragment RunEntity on DamnitRun {
    ${RUN_ALL_CELLS}
  }
`

// The three runs documents differ only in operation name and the @lightweight
// directive, but each needs its own name: the priority link throttles by
// operation name, and the mock server resolves by it. The directive no longer
// splits the cache entry (the field policy keys `runs` by database alone), so
// lightweight, deferred, and pushed rows all merge into one normalized run.
const buildTableDataQuery = (
  operationName: string,
  lightweight: boolean
) => gql`
  query ${operationName}(
    $proposal: String
    $page: Int
    $per_page: Int
    $names: [String!]
  ) {
    runs(
      database: { proposal: $proposal }
      page: $page
      per_page: $per_page
    ) ${lightweight ? '@lightweight' : ''} {
      ${RUN_CELLS}
    }
  }
`

export const TABLE_DATA_QUERY = buildTableDataQuery(
  TABLE_DATA_QUERY_NAME,
  false
)

export const LIGHTWEIGHT_TABLE_DATA_QUERY = buildTableDataQuery(
  `Lightweight${TABLE_DATA_QUERY_NAME}`,
  true
)

export const DEFERRED_TABLE_DATA_QUERY = buildTableDataQuery(
  DEFERRED_TABLE_DATA_QUERY_NAME,
  false
)

export type TableDataResult = {
  runs: Run[]
}

// Omitting `names` asks the server for every variable.
export type TableDataVariables = {
  proposal: string
  page?: number
  per_page?: number
  names?: string[]
}

/*
 * -----------------------------
 *   Metadata
 * -----------------------------
 */

// The metadata selection the query and the subscription share. Both write the
// same `metadata` cache entry, so they must select identical fields; keeping the
// shape in one place stops them drifting (mirrors CELL_FIELDS). `variables` and
// `tags` are JSON scalars, so they take no sub-selection; only `runs` and
// `timestamp` are typed on the wire.
const META_FIELDS = `
  runs {
    proposal
    run
  }
  variables
  tags
  timestamp
`

export const TABLE_META_QUERY = gql`
  query TableMetaQuery($proposal: String) {
    metadata(database: { proposal: $proposal }) {
      ${META_FIELDS}
    }
  }
`

export type TableMetaResult = {
  metadata: TableMeta
}

export type TableMetaVariables = {
  proposal: string
}

/*
 * -----------------------------
 *   Run updates (subscription)
 * -----------------------------
 */

export const RUN_UPDATES_SUBSCRIPTION = gql`
  subscription RunUpdates($proposal: String, $since: Timestamp!) {
    run_updates(database: { proposal: $proposal }, since: $since) {
      runs {
        ${RUN_ALL_CELLS}
      }
      metadata {
        ${META_FIELDS}
      }
      timestamp
    }
  }
`

export type RunUpdatesResult = {
  run_updates: {
    runs: Run[]
    metadata: TableMeta | null
    timestamp: number
  }
}

export type RunUpdatesVariables = {
  proposal: string
  since: number
}
