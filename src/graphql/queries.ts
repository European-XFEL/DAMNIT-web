import { gql } from "@apollo/client"

export const INITIALIZE_MUTATION = gql`
  mutation InitializeMutation($proposal: String) {
    initialize(database: { proposal: $proposal })
  }
`

export const TABLE_SCHEMA_QUERY = gql`
  query TableSchemaQuery($proposal: String) {
    schema(database: { proposal: $proposal })
  }
`

export const LATEST_RUN = "latest_run"

export const LATEST_RUN_SUBSCRIPTION = gql`
  subscription LatestRunSubcription($proposal: String) {
    ${LATEST_RUN}(database: { proposal: $proposal }) {
      runnr
      ... on p2956 {
        energy_min
      }
    }
  }
`

export const get_table_data_query = (type, fields = []) => {
  return gql`
    query TableDataQuery($proposal: String, $per_page: Int) {
      runs(database: { proposal: $proposal }, per_page: $per_page) {
        ... on ${type} {
          ${fields.join(" ")}
        }
      }
    }
  `
}
