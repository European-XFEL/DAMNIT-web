import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { OnMount } from '@monaco-editor/react'

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
    reset: () => initialState,
    setView: (state, action: PayloadAction<EditorView>) => {
      state.view = action.payload
    },
  },
})

export default slice.reducer
export const { reset, setView } = slice.actions
