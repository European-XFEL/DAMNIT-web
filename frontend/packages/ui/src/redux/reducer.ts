import { combineReducers } from '@reduxjs/toolkit'

import { authApi } from '../auth/auth.api'

import contextFile from '../features/context-file/context-file.slice'
import { contextfileApi } from '../features/context-file/context-file.api'
import extractedData from '../data/extracted/extracted-data.slice'
import metadata from '../data/metadata/metadata.slice'
import tableData from '../data/table/table-data.slice'

import dashboard from '../features/dashboard/dashboard.slice'
import plots from '../features/plots/plots.slice'
import table from '../features/table/table.slice'

const reducer = combineReducers({
  contextFile,
  dashboard,
  plots,
  metadata,
  table,
  tableData,
  extractedData,
  [authApi.reducerPath]: authApi.reducer,
  [contextfileApi.reducerPath]: contextfileApi.reducer,
})

export type RootState = ReturnType<typeof reducer>

export default reducer
