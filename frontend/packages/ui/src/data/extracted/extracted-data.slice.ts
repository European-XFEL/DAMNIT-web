/*
This is planned to be deprecated in favor of unified Redux and
Apollo Client store
*/

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import ExtractedDataServices from './extracted-data.services'
import { isStaleProposal, resetProposal } from '../../redux/actions'
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
  async ({ proposal, run, variable }: GetExtractedValueOptions, thunkAPI) => {
    const result = await ExtractedDataServices.getExtractedValue({
      proposal,
      run,
      variable,
    })

    // Drop the result if the user left this proposal while it was in flight,
    // so a late fulfillment can't refill the just-reset slice.
    if (isStaleProposal(thunkAPI.getState(), proposal)) {
      return thunkAPI.rejectWithValue('stale')
    }

    return { run, variable, ...result }
  }
)

const slice = createSlice({
  name: 'extractedData',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(resetProposal, () => initialState)
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
