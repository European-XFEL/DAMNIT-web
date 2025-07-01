import { combineReducers } from '@reduxjs/toolkit'
import { loadingBarReducer as loadingBar } from 'react-redux-loading-bar'

import { authApi } from '../auth'

import { metadataApi } from '../data/metadata'
import { contextfileApi } from '../features/contextfileeditor/contextfileeditor.api'
import { extractedDataReducer as extractedData } from '../data/extracted'
import { metadataReducer as metadata } from '../data/metadata'
import { tableDataReducer as tableData } from '../data/table'

import { dashboardReducer as dashboard } from '../features/dashboard'
import { plotsReducer as plots } from '../features/plots'
import { tableReducer as table } from '../features/table'

const reducer = combineReducers({
  dashboard,
  plots,
  metadata,
  table,
  tableData,
  extractedData,
  loadingBar,

  [authApi.reducerPath]: authApi.reducer,
  [metadataApi.reducerPath]: metadataApi.reducer,
  [contextfileApi.reducerPath]: contextfileApi.reducer,
})

export type RootState = ReturnType<typeof reducer>
export default reducer
