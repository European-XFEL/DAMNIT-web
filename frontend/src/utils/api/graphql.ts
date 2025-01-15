import { stripTypename } from "@apollo/client/utilities"

import { client } from "../../graphql/apollo"
import {
  EXTRACTED_DATA,
  EXTRACTED_DATA_QUERY,
  REFRESH_MUTATION,
  TABLE_METADATA_QUERY,
  get_table_data_query,
} from "../../graphql/queries"
import { size } from "../helpers"

export const tableService = {
  refresh,
  getExtractedData,
  getTableData,
  getTableMetadata,
  getTable,
}

function refresh({ proposal }) {
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
  fields,
  {
    proposal,
    page = 1,
    pageSize = 10,
    lightweight = false,
    deferred = false,
  } = {},
) {
  return client
    .query({
      query: get_table_data_query(
        `p${proposal}`,
        fields,
        lightweight,
        deferred,
      ),
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
              return [run.run.value, stripTypename(run)]
            }),
          )
        : null
    })
}

function getTableMetadata({ proposal }) {
  return client
    .query({
      query: TABLE_METADATA_QUERY,
      variables: {
        proposal: String(proposal),
      },
    })
    .then((result) => result.data.metadata)
}

function getTable({
  proposal,
  page = 1,
  pageSize = 5,
  lightweight = false,
} = {}) {
  let metadata

  return getTableMetadata({ proposal })
    .then((result) => {
      metadata = result
      return getTableData(Object.keys(result.variables), {
        proposal,
        page,
        pageSize,
        lightweight,
      })
    })
    .then((data) => ({ data, metadata }))
}

function getExtractedData({ proposal, run, variable }) {
  return client
    .query({
      query: EXTRACTED_DATA_QUERY,
      variables: {
        proposal: String(proposal),
        run,
        variable,
      },
    })
    .then((result) => result.data[EXTRACTED_DATA])
}
