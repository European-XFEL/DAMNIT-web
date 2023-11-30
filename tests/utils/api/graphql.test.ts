import { tableService } from "@/utils/api/graphql"

import {
  validTableState,
  validTableSchema,
} from "../../test-utils/builders/table"

beforeAll(async () => await tableService.initialize())

describe("GraphQL queries", () => {
  it.skip("gets the schema", async () => {
    const schema = await tableService.getTableSchema()
    // For some reason, GraphQL results need to be copied(?) before checking
    expect({ ...schema }).toEqual(validTableSchema)
  })

  it.skip("gets the table state", async () => {
    await tableService.getTable()
  })
})
