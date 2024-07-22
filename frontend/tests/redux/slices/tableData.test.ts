import { setupServer } from "msw/node"

import { getTableData, setupStore, updateTableData } from "@/redux"
import { tableService } from "@/utils/api/graphql"

import {
  validTableData,
  validTableMetadata,
  validTableSchema,
  validTableState,
} from "../../test-utils/builders/table"
import { handlers } from "../../test-utils/builders/graphql"

let server

describe("Table slice", () => {
  // For some reason, `toEqual` matcher mutates the input data.
  // This raises an error for read-only object.
  // https://github.com/vitest-dev/vitest/issues/4298

  // We check for each Redux children states for now.

  it("should return the initial state", () => {
    const { tableData: state } = setupStore().getState()
    expect(state.data).toEqual({})
    expect(state.metadata.schema).toEqual({})
    expect(state.metadata.rows).toEqual(0)
    expect(state.metadata.timestamp).toEqual(0)
    expect(state.lastUpdate).toEqual({})
  })

  describe("getTableData action", () => {
    server = setupServer(...handlers)

    beforeAll(() => server.listen())
    afterAll(() => server.close())
    afterEach(() => server.resetHandlers())

    it("sets table data and schema state when successful", () => {
      const { dispatch, getState } = setupStore()
      // eslint-disable-next-line jest/valid-expect-in-promise
      dispatch(getTableData({ proposal: 2956, page: 1 })).then(() => {
        const { tableData: state } = getState()
        expect(state.data).toEqual(validTableData)
        expect(state.metadata.schema).toEqual(validTableSchema)
        expect(state.metadata.rows).toEqual(validTableMetadata.rows)
        expect(state.lastUpdate).toEqual({})
      })
    })

    it("gets the data", async () => {
      const data = await tableService.getTableData(
        Object.keys(validTableSchema),
        { proposal: "2956" },
      )
      expect(data).toEqual(validTableData)
    })

    it("gets the metadata", async () => {
      const metadata = await tableService.getTableMetadata({ proposal: "2956" })
      expect(metadata.schema).toEqual(validTableSchema)
      expect(metadata.rows).toEqual(validTableMetadata.rows)
      expect(metadata.timestamp).toEqual(validTableMetadata.timestamp)
    })

    it("gets the table", async () => {
      const table = await tableService.getTable({ proposal: "2956" })
      expect(table.data).toEqual(validTableData)
      expect(table.metadata.schema).toEqual(validTableSchema)
    })
  })

  describe("updateTableData action", () => {
    it("sets table data and schema state when successful", () => {
      const { dispatch, getState } = setupStore({
        tableData: validTableState,
      })

      const newData = {
        "448": { energy_mean: "New value", new_variable: "New variable" },
        "449": { run: 449, new_variable: "Another new variable" },
      }
      const newSchema = {
        ...validTableSchema,
        energy_mean: "string",
        new_variable: "string",
      }
      const newMetadata = {
        schema: newSchema,
        rows: 10,
        timestamp: Date.now(),
      }

      dispatch(updateTableData({ runs: newData, metadata: newMetadata }))
      const { tableData: state } = getState()
      expect(state.data).toEqual({
        "448": { ...validTableData["448"], ...newData["448"] },
        "449": newData["449"],
      })
      expect(state.metadata.schema).toEqual(newSchema)
      expect(state.metadata.rows).toEqual(newMetadata.rows)
      expect(state.metadata.timestamp).toEqual(newMetadata.timestamp)
    })
  })
})
