import { stripTypename } from "@apollo/client/utilities"

import { client } from "../../app/apollo"
import {
  INITIALIZE_MUTATION,
  TABLE_SCHEMA_QUERY,
  get_table_data_query,
} from "../../graphql/queries"
import { PROPOSAL_NUMBER } from "../../constants"

export const tableService = {
  initialize,
  getTableData,
  getTableSchema,
  getTable,
}

function initialize({ proposal = PROPOSAL_NUMBER } = {}) {
  return client
    .mutate({
      mutation: INITIALIZE_MUTATION,
      variables: {
        proposal: String(proposal),
      },
    })
    .then((result) => result.data.schema)
}

function getTableData(
  schema,
  { proposal = PROPOSAL_NUMBER, pageSize = 10 } = {},
) {
  return client
    .query({
      query: get_table_data_query(`p${proposal}`, Object.keys(schema)),
      variables: {
        proposal: String(proposal),
        per_page: pageSize,
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
      query: TABLE_SCHEMA_QUERY,
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
