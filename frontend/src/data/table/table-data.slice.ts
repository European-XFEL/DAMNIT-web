/*
This is planned to be deprecated in favor of unified Redux and
Apollo Client store
*/

import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'

import TableDataServices from './table-data.services'
import { TableData, TableDataOptions, TableInfo } from './table-data.types'
import { Maybe } from '../../types'
import { isEmpty } from '../../utils/helpers'

interface TableDataState extends TableInfo {
  lastUpdate: Record<string, Maybe<number>>
}

const initialState: TableDataState = {
  data: {},
  metadata: { variables: {}, runs: [], timestamp: 0 },
  lastUpdate: {},
}

type TableDataQuery = {
  proposal: string
  page: number
  pageSize: number
}

export const getTable = createAsyncThunk(
  'tableData/get',
  async ({
    proposal,
    page,
    pageSize,
    lightweight,
  }: TableDataQuery & { lightweight: boolean }) => {
    const result = await TableDataServices.getTable({
      proposal,
      page,
      pageSize,
      lightweight,
    })

    return result
  }
)

export const getTableData = createAsyncThunk(
  'tableData/getData',
  async ({
    proposal,
    variables,
    page = 1,
    pageSize = 10000,
    deferred = false,
  }: TableDataOptions & { variables: string[] }) => {
    return (await TableDataServices.getTableData(['run', ...variables], {
      proposal,
      page,
      pageSize,
      deferred,
    })) as TableData
  }
)

interface UpdateInfo extends TableInfo {
  notify?: boolean
}

const slice = createSlice({
  name: 'tableData',
  initialState,
  reducers: {
    reset: () => initialState,
    update: (state, action: PayloadAction<UpdateInfo>) => {
      const { data, metadata } = action.payload

      // Update data
      if (!isEmpty(data)) {
        const timestamp = performance.now()
        const updatedData = { ...state.data }
        const updatedTimestamp = { ...state.lastUpdate }

        Object.entries(data).forEach(([run, variables]) => {
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
    builder.addCase(
      getTable.fulfilled,
      (state, action: PayloadAction<TableInfo>) => {
        // TODO: Add pending and rejected
        const { data, metadata } = action.payload
        if (!isEmpty(data)) {
          state.data = { ...state.data, ...data }
          state.metadata = metadata
        }
      }
    )
    builder.addCase(getTableData.fulfilled, (state, action) => {
      // TODO: Add pending and rejected
      const data = action.payload
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
