import { graphql, HttpResponse } from "msw"
import { validTableData, validTableMetadata } from "./table"

const damnit = graphql.link(
  `http://${import.meta.env.VITE_BACKEND_API}/graphql`,
)

const tableDataQueryHandler = damnit.query("TableDataQuery", () => {
  const response = {
    data: {
      runs: Object.values(validTableData).map((variables) => {
        const nested = Object.entries(variables).map(([variable, value]) => [
          variable,
          { value: value },
        ])
        nested.push(["__typename", `p${variables.proposal}`])
        return Object.fromEntries(nested)
      }),
    },
  }
  return HttpResponse.json(response)
})

const tableSchemaQueryHandler = damnit.query("TableMetadataQuery", () => {
  return HttpResponse.json({
    data: {
      metadata: validTableMetadata,
    },
  })
})

export const handlers = [tableDataQueryHandler, tableSchemaQueryHandler]
