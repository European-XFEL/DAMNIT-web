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

export const getVariableTableData = createAsyncThunk(
  "table/getVariableTableData",
  async (variable) => {
    const result = await tableService.getTableData(["run", variable], {
      pageSize: 10000, // get everything
    })
    return { data: result }
  },
)

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
    builder.addCase(getTable.fulfilled, (state, action) => {
      // TODO: Add pending and rejected
      const { data, metadata } = action.payload
      if (!isEmpty(data)) {
        state.data = { ...state.data, ...data }
        state.metadata = metadata
      }
    })
    builder.addCase(getVariableTableData.fulfilled, (state, action) => {
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
export const { selectRun, updateTable } = slice.actions
