import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { tableService } from "../../utils/api/graphql"

const initialState = {
  data: {},
  schema: {},
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
      const { run, schema } = action.payload
      state.data[run.runnr] = run
      state.schema = schema
      state.lastUpdate[run.runnr] = performance.now()
    },
  },
  extraReducers: (builder) => {
    builder.addCase(getTable.fulfilled, (state, action) => {
      const { data, schema } = action.payload
      // Only do something if data has contents
      if (Object.keys(data).length) {
        state.data = { ...state.data, ...data }
        state.schema = schema
      }
    })
    // TODO: Add getTable.pending and getTable.rejected
  },
})

export default slice.reducer
export const { selectRun, updateTable } = slice.actions
