/*
This is planned to be deprecated in favor of unified Redux and
Apollo Client store
*/

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { isEmpty } from "../../utils/helpers"
import { tableService } from "../../utils/api/graphql"

const initialState = {
  data: {},
  metadata: { variables: {}, runs: [], timestamp: 0 },
  lastUpdate: {},
}

export const getTableData = createAsyncThunk(
  "tableData/get",
  async ({ proposal, page, pageSize, lightweight }) => {
    // TODO: Create an object that contains `page` and `pageSize`
    const result = await tableService.getTable({
      proposal,
      page,
      pageSize,
      lightweight,
    })
    return result
  },
)

export const getTableVariables = createAsyncThunk(
  "tableData/getVariables",
  async ({ proposal, variables, page = 1, pageSize = 10000, deferred }) => {
    const result = await tableService.getTableData(["run", ...variables], {
      proposal,
      page,
      pageSize,
      deferred,
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
    builder.addCase(getTableVariables.fulfilled, (state, action) => {
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
export const { update: updateTableData, reset: resetTableData } = slice.actions

export const getDeferredTableData =
  ({ proposal, page = 1, pageSize = 5 }) =>
  async (dispatch) => {
    const { data } = await dispatch(
      getTableData({ proposal, page, pageSize, lightweight: true }),
    ).then((action) => action.payload)

    if (!data) {
      return
    }

    const heavyVariables = [
      ...new Set(
        Object.values(data).flatMap((run) =>
          Object.entries(run)
            .filter(([_, variables]) => variables?.value === null)
            .map(([variable]) => variable),
        ),
      ),
    ]

    dispatch(
      getTableVariables({
        proposal,
        variables: heavyVariables,
        page,
        pageSize,
        deferred: true,
      }),
    )
  }
