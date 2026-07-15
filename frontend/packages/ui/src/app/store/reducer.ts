import { combineReducers } from '@reduxjs/toolkit'

import { authApi } from '#src/features/auth/auth.api'
import contextFile from '#src/features/context-file/context-file.slice'
import { contextfileApi } from '#src/features/context-file/context-file.api'
import extractedData from '#src/data/extracted/extracted-data.slice'
import metadata from '#src/data/metadata/metadata.slice'
import tableData from '#src/data/table/table-data.slice'
import dashboard from '#src/features/dashboard/dashboard.slice'
import plots from '#src/features/plots/plots.slice'
import table from '#src/features/table/table.slice'

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
