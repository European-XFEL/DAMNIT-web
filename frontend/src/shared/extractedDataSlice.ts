/*
This is planned to be deprecated in favor of unified Redux and
Apollo Client store
*/

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { isEmpty } from "../utils/helpers"
import { tableService } from "../utils/api/graphql"

const initialState = {
  data: {},
  metadata: {},
  lastUpdate: {},
}

export const getExtractedVariable = createAsyncThunk(
  "extractedData/getVariable",
  async ({ run, variable }) => {
    const result = await tableService.getExtractedData({ run, variable })
    return { run, variable, ...result }
  },
)

export const getAllExtracted = createAsyncThunk(
  "extractedData/getAll",
  async (variable) => {
    const _runs = await tableService.getTableData(["run"], {
      pageSize: 10000, // get everything
    })

    const result = []
    const runs = Object.keys(_runs).map((run) => Number(run))

    for (const run of runs) {
      const partialResult = await tableService.getExtractedData({
        run,
        variable,
      })
      result.push({ run, variable, ...partialResult })
    }

    return result
  },
)

const slice = createSlice({
  name: "extractedData",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(getExtractedVariable.fulfilled, (state, action) => {
      // TODO: Add pending and rejected
      const { run, variable, data, metadata } = action.payload
      if (!isEmpty(data)) {
        state.data = {
          ...state.data,
          [run]: { ...(state.data[run] || {}), [variable]: data },
        }
        state.metadata = {
          ...state.metadata,
          [run]: { ...(state.metadata[run] || {}), [variable]: metadata },
        }
      }
    })
    builder.addCase(getAllExtracted.pending, (state, action) => {
      //TODO: indicate processing to user
    })
    builder.addCase(getAllExtracted.fulfilled, (state, action) => {
      action.payload.forEach(({ run, variable, data, metadata }) => {
        if (!isEmpty(data)) {
          state.data = {
            ...state.data,
            [run]: { ...(state.data[run] ?? {}), [variable]: data },
          }
          state.metadata = {
            ...state.metadata,
            [run]: { ...(state.metadata[run] ?? {}), [variable]: metadata },
          }
        }
      })
    })
  },
})

export default slice.reducer
