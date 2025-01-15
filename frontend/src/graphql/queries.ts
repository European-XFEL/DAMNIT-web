import { gql } from "@apollo/client"

export const REFRESH_MUTATION = gql`
  mutation RefreshMutation($proposal: String) {
    refresh(database: { proposal: $proposal })
  }
`

export const TABLE_METADATA_QUERY = gql`
  query TableMetadataQuery($proposal: String) {
    metadata(database: { proposal: $proposal })
  }
`

export const EXTRACTED_DATA = "extracted_data"

export const EXTRACTED_DATA_QUERY = gql`
  query ExtractedDataQuery($proposal: String, $run: Int!, $variable: String!) {
    ${EXTRACTED_DATA}(
      database: { proposal: $proposal }
      run: $run
      variable: $variable
    )
  }
`

export const LATEST_DATA = "latest_data"

export const LATEST_DATA_SUBSCRIPTION = gql`
  subscription LatestRunSubcription($proposal: String, $timestamp: Timestamp!) {
    ${LATEST_DATA}(database: { proposal: $proposal }, timestamp: $timestamp) 
  }
`

const TABLE_DATA_QUERY_NAME = "TableDataQuery"
export const DEFERRED_TABLE_DATA_QUERY_NAME = `Deferred${TABLE_DATA_QUERY_NAME}`

export const get_table_data_query = (
  type,
  fields = [],
  lightweight = false,
  deferred = false,
) => {
  return gql`
    query ${
      deferred ? DEFERRED_TABLE_DATA_QUERY_NAME : TABLE_DATA_QUERY_NAME
    }($proposal: String, $page: Int, $per_page: Int) {
      runs(database: { proposal: $proposal }, page: $page, per_page: $per_page) ${
        lightweight ? "@lightweight" : ""
      } {
        ... on ${type} {
          ${fields.map((field) => `${field} { value dtype }`).join(" ")}
        }
      }
    }
  `
}
