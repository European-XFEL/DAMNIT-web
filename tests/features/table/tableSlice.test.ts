import { setupServer } from "msw/node"

import { setupStore } from "@/app/store"
import { getTable } from "@/features/table"
import { tableService } from "@/utils/api"

import {
  validTableData,
  validTableSchema,
} from "../../test-utils/builders/table"
import {
  tableDataHandler,
  tableSchemaHandler,
} from "../../test-utils/builders/api"

let server

describe("Table slice", () => {
  it("should return the initial state", () => {
    const { table: state } = setupStore().getState()
    expect(state).toEqual({ data: {}, schema: {}, selection: {} })
  })

  describe("getTable action", () => {
    server = setupServer(
      tableDataHandler({ body: validTableData }),
      tableSchemaHandler({ body: validTableSchema }),
    )

    beforeAll(() => server.listen())
    afterAll(() => server.close())
    afterEach(() => server.resetHandlers())

    it("sets table data and schema state when successful", () => {
      const { dispatch, getState } = setupStore()
      // eslint-disable-next-line jest/valid-expect-in-promise
      dispatch(getTable()).then(() => {
        const { table: state } = getState()
        expect(state).toEqual({
          data: validTableData,
          schema: validTableSchema,
          selection: {},
        })
      })
    })

    it("gets the data", async () => {
      const data = await tableService.getTableData()
      expect(data).toEqual(validTableData)
    })

    it("gets the schema", async () => {
      const schema = await tableService.getTableSchema()
      expect(schema).toEqual(validTableSchema)
    })

    it("gets the table", async () => {
      const table = await tableService.getTable()
      expect(table).toEqual({ data: validTableData, schema: validTableSchema })
    })
  })
})
