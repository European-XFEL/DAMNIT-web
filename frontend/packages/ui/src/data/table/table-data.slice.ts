/*
This is planned to be deprecated in favor of unified Redux and
Apollo Client store
*/

import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit'

import TableDataServices from './table-data.services'
import { type TableDataOptions, type TableInfo } from './table-data.types'
import { resetProposal } from '../../redux/actions'
import { type Maybe } from '../../types'
import { isEmpty } from '../../utils/helpers'

interface TableDataState extends TableInfo {
  lastUpdate: Record<string, Maybe<number>>
}

const initialState: TableDataState = {
  data: {},
  metadata: { variables: {}, runs: [], timestamp: 0, tags: {} },
  lastUpdate: {},
}

type TableOptions = Omit<TableDataOptions, 'deferred'>

export const getTable = createAsyncThunk(
  'tableData/get',
  async ({ proposal, page, pageSize, lightweight = false }: TableOptions) => {
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
    return await TableDataServices.getTableData({
      proposal,
      variables: ['run', ...variables],
      page,
      pageSize,
      deferred,
    })
  }
)

interface UpdateInfo extends TableInfo {
  notify?: boolean
}

const slice = createSlice({
  name: 'tableData',
  initialState,
  reducers: {
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

      // A subscription push resends runs, variables, and timestamp but never
      // tags, so replacing wholesale would drop them and crash the tag-driven
      // column visibility. Merge so unsent fields (tags) survive.
      state.metadata = { ...state.metadata, ...metadata }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetProposal, () => initialState)
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
export const { update: updateTable } = slice.actions
