import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { tableService } from "../../utils/api/graphql"
import { isEmpty } from "../../utils/helpers"

const initialState = {
  data: {},
  metadata: { schema: {}, rows: 0, timestamp: 0 },
  selection: { run: null, variables: null },
  lastUpdate: {},
}

export const getTable = createAsyncThunk("table/getTable", async (page) => {
  // TODO: Create an object that contains `page` and `pageSize`
  const result = await tableService.getTable({ page })
  return result
})

const slice = createSlice({
  name: "table",
  initialState,
  reducers: {
    selectRun: ({ selection }, action) => {
      const { run, variables } = action.payload
      selection.run = run
      selection.variables = variables
    },
    displayData: ({ selection }, action) => {},
    updateTable: (state, action) => {
      const { runs, metadata } = action.payload
      if (isEmpty(runs)) {
        return
      }

      const timestamp = performance.now()
      const updatedData = { ...state.data }
      const updatedTimestamp = { ...state.lastUpdate }

      Object.entries(runs).forEach(([run, variables]) => {
        updatedData[run] = { ...(updatedData[run] || { run }), ...variables }
        updatedTimestamp[run] = timestamp
      })

      state.data = updatedData
      state.lastUpdate = updatedTimestamp
      state.metadata = metadata
    },
  },
  extraReducers: (builder) => {
    builder.addCase(getTable.fulfilled, (state, action) => {
      const { data, metadata } = action.payload
      if (!isEmpty(data)) {
        state.data = { ...state.data, ...data }
        state.metadata = metadata
      }
    })
    // TODO: Add getTable.pending and getTable.rejected
  },
})

export default slice.reducer
export const { selectRun, updateTable } = slice.actions
