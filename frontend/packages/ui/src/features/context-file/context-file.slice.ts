import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { OnMount } from '@monaco-editor/react'

import { resetProposal } from '#src/app/store/actions'

type EditorView = ReturnType<Parameters<OnMount>[0]['saveViewState']>

type ContextFileState = {
  view: EditorView
}

const initialState: ContextFileState = {
  view: null,
}

const slice = createSlice({
  name: 'contextFile',
  initialState,
  reducers: {
    setView: (state, action: PayloadAction<EditorView>) => {
      state.view = action.payload
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetProposal, () => initialState)
  },
})

export default slice.reducer
export const { setView } = slice.actions
