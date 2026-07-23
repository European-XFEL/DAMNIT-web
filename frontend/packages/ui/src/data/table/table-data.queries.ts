import { gql } from '@apollo/client'

import {
  DEFERRED_TABLE_DATA_QUERY_NAME,
  LATEST_DATA_FIELD_NAME,
  TABLE_DATA_QUERY_NAME,
} from './table-data.constants'
import { type DamnitRun } from './table-data.transforms'
import { type TableMetadata } from './table-data.types'

/*
 * -----------------------------
 *   Runs
 * -----------------------------
 */

// The three runs documents differ only in operation name and the @lightweight
// directive, but each needs its own name: the priority link throttles by
// operation name, and the mock server resolves by it.
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
      cells(names: $names) {
        name
        value
        dtype
        error {
          message
          cls
        }
      }
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
  runs: DamnitRun[]
}

// Omitting `names` asks the server for every variable.
export type TableDataVariables = {
  proposal: string
  page: number
  per_page: number
  names?: string[]
}

/*
 * -----------------------------
 *   Metadata
 * -----------------------------
 */

export const TABLE_METADATA_QUERY = gql`
  query TableMetadataQuery($proposal: String) {
    metadata(database: { proposal: $proposal })
  }
`

// `metadata` is an opaque JSON scalar, so nothing here is checked against the
// schema. Runs arrive as numbers; the table keys its rows by string.
export type TableMetadataResult = {
  metadata: Omit<TableMetadata, 'runs'> & { runs: number[] }
}

export type TableMetadataVariables = {
  proposal: string
}

/*
 * -----------------------------
 *   Latest data
 * -----------------------------
 */

export const LATEST_DATA_SUBSCRIPTION = gql`
  subscription LatestRunSubcription($proposal: String, $timestamp: Timestamp!) {
    ${LATEST_DATA_FIELD_NAME}(database: { proposal: $proposal }, timestamp: $timestamp)
  }
`
