import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { tableService } from "../../utils/api/graphql"

const initialState = {
  data: {},
  schema: {},
  selection: {},
  lastUpdate: {},
}

export const getTable = createAsyncThunk("table/getTable", async () => {
  const result = await tableService.getTable()
  return result
})

const slice = createSlice({
  name: "table",
  initialState,
  reducers: {
    selectRun: ({ selection }, action) => {
      selection.run = action.payload
    },
    updateTable: (state, action) => {
      const { run, schema } = action.payload
      state.data[run.runnr] = run
      state.schema = schema
      state.lastUpdate[run.runnr] = performance.now()
    },
  },
  extraReducers: (builder) => {
    builder.addCase(getTable.fulfilled, (state, action) => {
      const { data, schema } = action.payload
      state.data = data
      state.schema = schema
    })
    // TODO: Add getTable.pending and getTable.rejected
  },
})

export default slice.reducer
export const { selectRun, updateTable } = slice.actions
