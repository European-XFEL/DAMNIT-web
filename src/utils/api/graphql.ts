import { stripTypename } from "@apollo/client/utilities"

import { client } from "../../app/apollo"
import {
  REFRESH_MUTATION,
  TABLE_METADATA_QUERY,
  get_table_data_query,
} from "../../graphql/queries"
import { PROPOSAL_NUMBER } from "../../constants"
import { size } from "../helpers"

export const tableService = {
  refresh,
  getTableData,
  getTableMetadata,
  getTable,
}

function refresh({ proposal = PROPOSAL_NUMBER } = {}) {
  return client
    .mutate({
      mutation: REFRESH_MUTATION,
      variables: {
        proposal: String(proposal),
      },
    })
    .then((result) => result.data)
}

function getTableData(
  schema,
  { proposal = PROPOSAL_NUMBER, page = 1, pageSize = 10 } = {},
) {
  return client
    .query({
      query: get_table_data_query(`p${proposal}`, Object.keys(schema)),
      variables: {
        proposal: String(proposal),
        page,
        per_page: pageSize,
      },
    })
    .then(({ data }) => {
      // TODO: Filter out empty values
      return size(data.runs)
        ? Object.fromEntries(
            data.runs.map((run) => {
              return [run.run.value, getRunValue(stripTypename(run))]
            }),
          )
        : null
    })
}

function getTableMetadata({ proposal = PROPOSAL_NUMBER } = {}) {
  return client
    .query({
      query: TABLE_METADATA_QUERY,
      variables: {
        proposal: String(proposal),
      },
    })
    .then((result) => result.data.metadata)
}

function getTable({ proposal = PROPOSAL_NUMBER, page = 1, pageSize = 5 } = {}) {
  let metadata

  return getTableMetadata({ proposal })
    .then((result) => {
      metadata = result
      return getTableData(result.schema, { proposal, page, pageSize })
    })
    .then((data) => ({ data, metadata }))
}

// Helpers --------------------------------------------------------------------

const getRunValue = (run) => {
  return Object.fromEntries(
    Object.entries(run).map(([variable, data]) => [variable, data.value]),
  )
}
