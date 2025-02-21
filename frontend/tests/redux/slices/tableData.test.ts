import { setupServer } from "msw/node"

import { setupStore } from "@/redux"
import { getTableData, updateTableData } from "@/redux/slices"

import { tableService } from "@/utils/api/graphql"

import {
  validTableData,
  validTableMetadata,
  validTableVariables,
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
    expect(state.metadata.variables).toEqual({})
    expect(state.metadata.runs).toEqual([])
    expect(state.metadata.timestamp).toEqual(0)
    expect(state.lastUpdate).toEqual({})
  })

  describe("getTableData action", () => {
    server = setupServer(...handlers)

    beforeAll(() => server.listen())
    afterAll(() => server.close())
    afterEach(() => server.resetHandlers())

    it("sets table data and metadata state when successful", () => {
      const { dispatch, getState } = setupStore()
      dispatch(getTableData({ proposal: 2956, page: 1 })).then(() => {
        const { tableData: state } = getState()
        expect(state.data).toEqual(validTableData)
        expect(state.metadata.variables).toEqual(validTableMetadata.variables)
        expect(state.metadata.rows).toEqual(validTableMetadata.rows)
        expect(state.lastUpdate).toEqual({})
      })
    })

    it("gets the data", async () => {
      const data = await tableService.getTableData(
        Object.keys(validTableVariables),
        { proposal: "2956" },
      )
      expect(data).toEqual(validTableData)
    })

    it("gets the metadata", async () => {
      const metadata = await tableService.getTableMetadata({ proposal: "2956" })
      expect(metadata.variables).toEqual(validTableVariables)
      expect(metadata.rows).toEqual(validTableMetadata.rows)
      expect(metadata.timestamp).toEqual(validTableMetadata.timestamp)
    })

    it("gets the table", async () => {
      const table = await tableService.getTable({ proposal: "2956" })
      expect(table.data).toEqual(validTableData)
      expect(table.metadata.variables).toEqual(validTableVariables)
    })
  })

  describe("updateTableData action", () => {
    it("sets table data and metadata state when successful", () => {
      const { dispatch, getState } = setupStore({
        tableData: validTableState,
      })

      const newData = {
        "448": {
          energy_mean: { value: "New value", dtype: "string" },
          new_variable: { value: "New variable", dtype: "string" },
        },
        "449": {
          run: { value: 449, dtype: "number" },
          new_variable: { value: "Another new variable", dtype: "string" },
        },
      }

      const newVariables = {
        ...validTableVariables,
        energy_mean: {
          name: "energy_mean",
          title: "Energy new (mean)",
        },
        new_variable: {
          name: "new_variable",
          title: "New Variable",
        },
      }

      const newMetadata = {
        variables: newVariables,
        rows: 10,
        timestamp: Date.now(),
      }

      dispatch(updateTableData({ runs: newData, metadata: newMetadata }))
      const { tableData: state } = getState()
      expect(state.data).toEqual({
        "448": { ...validTableData["448"], ...newData["448"] },
        "449": newData["449"],
      })
      expect(state.metadata.variables).toEqual(newVariables)
      expect(state.metadata.rows).toEqual(newMetadata.rows)
      expect(state.metadata.timestamp).toEqual(newMetadata.timestamp)
    })
  })
})
