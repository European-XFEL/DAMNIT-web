import { gql } from '@apollo/client'
import { stripTypename } from '@apollo/client/utilities'

import {
  DEFERRED_TABLE_DATA_QUERY_NAME,
  LATEST_DATA_FIELD_NAME,
  TABLE_DATA_QUERY_NAME,
} from './table-data.constants'
import {
  TableData,
  TableDataOptions,
  TableInfo,
  TableMetadata,
  TableMetadataOptions,
} from './table-data.types'
import { client } from '../../graphql/apollo'
import { WithTypeName } from '../../types'
import { isEmpty } from '../../utils/helpers'

/*
 * -----------------------------
 *   Query: getTableData
 * -----------------------------
 */

const get_table_data_query = (
  type: string,
  fields: string[] = [],
  lightweight = false,
  deferred = false
) => {
  return gql`
    query ${
      deferred ? DEFERRED_TABLE_DATA_QUERY_NAME : TABLE_DATA_QUERY_NAME
    }($proposal: String, $page: Int, $per_page: Int) {
      runs(database: { proposal: $proposal }, page: $page, per_page: $per_page) ${
        lightweight ? '@lightweight' : ''
      } {
        ... on ${type} {
          ${fields.map((field) => `${field} { value dtype }`).join(' ')}
        }
      }
    }
  `
}

async function getTableData(
  fields: string[],
  options: TableDataOptions
): Promise<TableData> {
  const {
    proposal,
    page = 1,
    pageSize = 10,
    lightweight = false,
    deferred = false,
  } = options

  const { data } = await client.query({
    query: get_table_data_query(`p${proposal}`, fields, lightweight, deferred),
    variables: {
      proposal: String(proposal),
      page,
      per_page: pageSize,
    },
  })

  if (isEmpty(data.runs)) {
    return {}
  }

  return Object.fromEntries(
    data.runs.map((run: WithTypeName<TableData>) => {
      return [run.run.value, stripTypename(run)]
    })
  )
}

/*
 * -----------------------------
 *   Query: getTableMetadata
 * -----------------------------
 */

const TABLE_METADATA_QUERY = gql`
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
  const data = await getTableData(Object.keys(metadata.variables), {
    proposal,
    ...options,
  })

  return { data, metadata }
}

/*
 * -----------------------------
 *   Mutation: refresh
 * -----------------------------
 */

export const REFRESH_MUTATION = gql`
  mutation RefreshMutation($proposal: String) {
    refresh(database: { proposal: $proposal })
  }
`

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
