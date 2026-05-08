import { gql } from '@apollo/client'

import {
  DEFERRED_TABLE_DATA_QUERY_NAME,
  LATEST_DATA_FIELD_NAME,
  TABLE_DATA_QUERY_NAME,
} from './table-data.constants'
import {
  type TableData,
  type TableDataOptions,
  type TableInfo,
  type TableMetadata,
  type TableMetadataOptions,
} from './table-data.types'
import { client } from '../../graphql/apollo'
import { type VariableDataItem, type VariableValue } from '../../types'
import { isEmpty } from '../../utils/helpers'

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

type DamnitVariable = {
  name: string
  value: VariableValue
  dtype: string
}

type DamnitRun = {
  variables: DamnitVariable[]
}

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
      }
    }

    table[String(runVariable.value)] = row
  }

  return table
}

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

  const { data } = await client.query({
    query: pickTableDataQuery(lightweight, deferred),
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
  const result = await client.query({
    query: TABLE_METADATA_QUERY,
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
