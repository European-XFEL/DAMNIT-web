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

export const LATEST_DATA = "latest_data"

export const LATEST_DATA_SUBSCRIPTION = gql`
  subscription LatestRunSubcription($proposal: String, $timestamp: Timestamp!) {
    ${LATEST_DATA}(database: { proposal: $proposal }, timestamp: $timestamp) 
  }
`

export const get_table_data_query = (type, fields = []) => {
  return gql`
    query TableDataQuery($proposal: String, $page: Int, $per_page: Int) {
      runs(database: { proposal: $proposal }, page: $page, per_page: $per_page) {
        ... on ${type} {
          ${fields.map((field) => `${field} { value }`).join(" ")}
        }
      }
    }
  `
}
