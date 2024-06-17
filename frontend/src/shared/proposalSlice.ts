import { createSlice, PayloadAction } from "@reduxjs/toolkit"

interface State {
  current: string
  proposals: Record<string, any>
}

const initialState: State = {
  current: "",
  proposals: {},
}

const slice = createSlice({
  name: "proposal",
  initialState,
  reducers: {
    setCurrent(state, action: PayloadAction<string>) {
      state.current = action.payload
    },
    setProposals(state, action: PayloadAction<Record<string, any>>) {
      state.proposals = action.payload
    },
  },
})

export const { setCurrent, setProposals } = slice.actions

export default slice.reducer
export const { setCurrent: setCurrentProposal } = slice.actions
