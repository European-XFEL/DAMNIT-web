import { createSlice, PayloadAction } from "@reduxjs/toolkit"

interface Proposal {
  value: string
  loading: boolean
  notFound: boolean
}

interface State {
  current: Proposal
  records: Record<string, any>
}

const initialState: State = {
  current: {
    value: "",
    loading: false,
    notFound: false,
  },
  records: {},
}

const slice = createSlice({
  name: "proposal",
  initialState,
  reducers: {
    setProposalPending(state, action: PayloadAction<string>) {
      state.current = {
        ...initialState.current,
        loading: true,
        value: action.payload,
      }
    },
    setProposalSuccess(state) {
      state.current.loading = false
    },
    setProposalNotFound(state) {
      state.current.loading = false
      state.current.notFound = true
    },
  },
})

export default slice.reducer
export const { setProposalPending, setProposalSuccess, setProposalNotFound } =
  slice.actions
