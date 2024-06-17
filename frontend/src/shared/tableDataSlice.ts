/*
This is planned to be deprecated in favor of unified Redux and
Apollo Client store
*/

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { isEmpty } from "../utils/helpers"
import { tableService } from "../utils/api/graphql"

const initialState = {
  data: {},
  metadata: { schema: {}, rows: 0, timestamp: 0 },
  lastUpdate: {},
}

export const getTableData = createAsyncThunk(
  "tableData/get",
  async ({ proposal, page }) => {
    // TODO: Create an object that contains `page` and `pageSize`
    const result = await tableService.getTable({ proposal, page })
    return result
  },
)

export const getTableVariable = createAsyncThunk(
  "tableData/getVariable",
  async ({ proposal, variable }) => {
    const result = await tableService.getTableData(["run", variable], {
      proposal,
      pageSize: 10000, // get everything
    })
    return { data: result }
  },
)

const slice = createSlice({
  name: "tableData",
  initialState,
  reducers: {
    reset: () => initialState,
    update: (state, action) => {
      const { runs, metadata } = action.payload

      // Update runs
      if (!isEmpty(runs)) {
        const timestamp = performance.now()
        const updatedData = { ...state.data }
        const updatedTimestamp = { ...state.lastUpdate }

        Object.entries(runs).forEach(([run, variables]) => {
          updatedData[run] = { ...(updatedData[run] || { run }), ...variables }
          updatedTimestamp[run] = timestamp
        })

        state.data = updatedData
        state.lastUpdate = updatedTimestamp
      }

      // Update metadata
      state.metadata = metadata
    },
  },
  extraReducers: (builder) => {
    builder.addCase(getTableData.fulfilled, (state, action) => {
      // TODO: Add pending and rejected
      const { data, metadata } = action.payload
      if (!isEmpty(data)) {
        state.data = { ...state.data, ...data }
        state.metadata = metadata
      }
    })
    builder.addCase(getTableVariable.fulfilled, (state, action) => {
      // TODO: Add pending and rejected
      const { data } = action.payload
      const updatedData = { ...state.data }

      Object.entries(data).forEach(([run, variables]) => {
        updatedData[run] = { ...(updatedData[run] || { run }), ...variables }
      })

      state.data = updatedData
    })
  },
})

export default slice.reducer
export const { update: updateTable, reset: resetTable } = slice.actions
