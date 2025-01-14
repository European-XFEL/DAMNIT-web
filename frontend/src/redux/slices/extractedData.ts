/*
This is planned to be deprecated in favor of unified Redux and
Apollo Client store
*/

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { isEmpty } from "../../utils/helpers"
import { tableService } from "../../utils/api/graphql"

const initialState = {
  data: {},
  metadata: {},
  lastUpdate: {},
}

export const getExtractedVariable = createAsyncThunk(
  "extractedData/getVariable",
  async ({ proposal, run, variable }) => {
    const result = await tableService.getExtractedData({
      proposal,
      run,
      variable,
    })
    return { run, variable, ...result }
  },
)

const slice = createSlice({
  name: "extractedData",
  initialState,
  reducers: {
    reset: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(getExtractedVariable.fulfilled, (state, action) => {
      // TODO: Add pending and rejected
      const { run, variable, data, ...metadata } = action.payload
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
  },
})

export default slice.reducer
export const { reset: resetExtractedData } = slice.actions
