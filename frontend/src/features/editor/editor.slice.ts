import { createSlice } from "@reduxjs/toolkit"
import { useAppSelector } from "../../redux"
import { act } from "react" 

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
    upadateLastModified: (state, action) => {
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