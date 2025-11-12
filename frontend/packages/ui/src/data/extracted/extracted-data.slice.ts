/*
This is planned to be deprecated in favor of unified Redux and
Apollo Client store
*/

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import ExtractedDataServices from './extracted-data.services'
import { type ExtractedDataItem, type ExtractedMetadataItem } from '../../types'

type ExtractedDataState = {
  data: { [run: string]: { [variable: string]: ExtractedDataItem } }
  metadata: { [run: string]: { [variable: string]: ExtractedMetadataItem } }
}

const initialState: ExtractedDataState = {
  data: {},
  metadata: {},
}

type GetExtractedValueOptions = {
  proposal: string
  run: string
  variable: string
}

export const getExtractedValue = createAsyncThunk(
  'extractedData/getValue',
  async ({ proposal, run, variable }: GetExtractedValueOptions) => {
    const result = await ExtractedDataServices.getExtractedValue({
      proposal,
      run,
      variable,
    })
    return { run, variable, ...result }
  }
)

const slice = createSlice({
  name: 'extractedData',
  initialState,
  reducers: {
    reset: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(getExtractedValue.fulfilled, (state, action) => {
      // TODO: Add pending and rejected
      const { run, variable, data, ...metadata } = action.payload
      state.data = {
        ...state.data,
        [run]: { ...(state.data[run] ?? {}), [variable]: data },
      }
      state.metadata = {
        ...state.metadata,
        [run]: { ...(state.metadata[run] ?? {}), [variable]: metadata },
      }
    })
  },
})

export default slice.reducer
export const { reset: resetExtractedData } = slice.actions
