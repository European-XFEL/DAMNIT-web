import { createSlice, PayloadAction } from "@reduxjs/toolkit"

type EditorState = {
  isOpen: boolean,
  lastModified: number | null,
  unseenChanges: boolean,
}

const initialState: EditorState = {
  isOpen: false,
  lastModified: null,
  unseenChanges: false,
}

interface UpdateLastModifiedPayload {
  lastModified: number
  isEditorVisible: boolean
}

const slice = createSlice({
  name: "editor",
  initialState,
  reducers: {
    openEditor: (state) => {
      state.isOpen = true
      state.unseenChanges = false
    },
    resetEditor: (state) => {
      state.isOpen = false
    },
    upadateLastModified: (state, action: PayloadAction<UpdateLastModifiedPayload>) => {
      const { lastModified, isEditorVisible } = action.payload 
      if (!isEditorVisible && state.lastModified) { state.unseenChanges = true}
      state.lastModified = lastModified
    },
    clearUnseenChanges: (state) => {
      state.unseenChanges = false
    }
  },
})

export default slice.reducer
export const { openEditor, resetEditor, upadateLastModified, clearUnseenChanges } = slice.actions