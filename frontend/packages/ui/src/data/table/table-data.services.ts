import { gql } from '@apollo/client'

import { client } from '#src/graphql/apollo'
import { isEmpty } from '#src/utils/helpers'

import {
  DEFERRED_TABLE_DATA_QUERY_NAME,
  LATEST_DATA_FIELD_NAME,
  TABLE_DATA_QUERY_NAME,
} from './table-data.constants'
import {
  type TableDataOptions,
  type TableData,
  type TableInfo,
  type TableMetadata,
  type TableMetadataOptions,
} from './table-data.types'
import { type DamnitRun, flattenRuns } from './table-data.transforms'

/*
 * -----------------------------
 *   Query: getTableData
 * -----------------------------
 */

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
      variables(names: $names) {
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

const TABLE_DATA_QUERY = buildTableDataQuery(TABLE_DATA_QUERY_NAME, false)
const LIGHTWEIGHT_TABLE_DATA_QUERY = buildTableDataQuery(
  `Lightweight${TABLE_DATA_QUERY_NAME}`,
  true
)
const DEFERRED_TABLE_DATA_QUERY = buildTableDataQuery(
  DEFERRED_TABLE_DATA_QUERY_NAME,
  false
)

function pickTableDataQuery(lightweight: boolean, deferred: boolean) {
  if (deferred) {
    return DEFERRED_TABLE_DATA_QUERY
  }
  if (lightweight) {
    return LIGHTWEIGHT_TABLE_DATA_QUERY
  }
  return TABLE_DATA_QUERY
}

async function getTableData(options: TableDataOptions): Promise<TableData> {
  const {
    proposal,
    page = 1,
    pageSize = 10,
    lightweight = false,
    deferred = false,
    variables,
  } = options

  // Redux renders this data, not the Apollo cache. Keeping the query off the
  // cache stops a fetch that resolves after resetProposal from writing the
  // departed proposal's runs back into the just-evicted ROOT_QUERY.
  const { data } = await client.query({
    query: pickTableDataQuery(lightweight, deferred),
    fetchPolicy: 'no-cache',
    variables: {
      proposal: String(proposal),
      page,
      per_page: pageSize,
      names: variables,
    },
  })

  if (isEmpty(data.runs)) {
    return {}
  }

  return flattenRuns(data.runs as DamnitRun[])
}

/*
 * -----------------------------
 *   Query: getTableMetadata
 * -----------------------------
 */

export const TABLE_METADATA_QUERY = gql`
  query TableMetadataQuery($proposal: String) {
    metadata(database: { proposal: $proposal })
  }
`

async function getTableMetadata({ proposal }: TableMetadataOptions) {
  // See getTableData: no-cache so a late fetch can't repopulate ROOT_QUERY
  // after teardown. useProposal keeps the watched cache-and-network copy.
  const result = await client.query({
    query: TABLE_METADATA_QUERY,
    fetchPolicy: 'no-cache',
    variables: {
      proposal: String(proposal),
    },
  })

  const metadata = result.data.metadata
  const runs = metadata.runs.map(String)
  return { ...metadata, runs }
}

/*
 * -----------------------------
 *   Query: getTable
 * -----------------------------
 */

async function getTable({
  proposal,
  ...options
}: TableDataOptions | TableMetadataOptions): Promise<TableInfo> {
  const metadata: TableMetadata = await getTableMetadata({ proposal })
  const data = await getTableData({ proposal, ...options })

  return { data, metadata }
}

/*
 * -----------------------------
 *   Subscription: latest data
 * -----------------------------
 */

export const LATEST_DATA_SUBSCRIPTION = gql`
  subscription LatestRunSubcription($proposal: String, $timestamp: Timestamp!) {
    ${LATEST_DATA_FIELD_NAME}(database: { proposal: $proposal }, timestamp: $timestamp)
  }
`

const TableDataServices = {
  getTable,
  getTableData,
  getTableMetadata,
}

export default TableDataServices
