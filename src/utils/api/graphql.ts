import { gql } from "@apollo/client"
import { stripTypename } from "@apollo/client/utilities"

import { client } from "../../app/apollo"

export const tableService = {
  initialize,
  getTableData,
  getTableSchema,
  getTable,
}

const PROPOSAL_NUMBER = 2956

function initialize({ proposal = PROPOSAL_NUMBER } = {}) {
  return client
    .mutate({
      mutation: gql`
        mutation InitializeMutation($proposal: String) {
          initialize(database: { proposal: $proposal })
        }
      `,
      variables: {
        proposal: String(proposal),
      },
    })
    .then((result) => result.data.schema)
}

function getTableData(
  schema,
  { proposal = PROPOSAL_NUMBER, pageSize = 2 } = {},
) {
  const model = `p${proposal}`
  const query = gql`
    query p2956_query($proposal: String = "${proposal}") {
      runs(database: { proposal: $proposal }, per_page: ${pageSize}) {
        ... on ${model} {
          ${Object.keys(schema).join(" ")}
        }
      }
    }
  `

  return client
    .query({
      query,
      variables: {
        proposal: String(proposal),
      },
    })
    .then(({ data }) => {
      // TODO: Filter out empty values
      return Object.fromEntries(
        data.runs.map((run) => [run.runnr, stripTypename(run)]),
      )
    })
}

function getTableSchema({ proposal = PROPOSAL_NUMBER } = {}) {
  return client
    .query({
      query: gql`
        query TableSchemaQuery($proposal: String) {
          schema(database: { proposal: $proposal })
        }
      `,
      variables: {
        proposal: String(proposal),
      },
    })
    .then((result) => result.data.schema)
}

function getTable() {
  let schema

  return getTableSchema()
    .then((result) => {
      schema = result
      return getTableData(schema)
    })
    .then((data) => ({ data, schema }))
}
