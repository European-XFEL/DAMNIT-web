import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface Proposal {
  value: string
  loading: boolean
  notFound: boolean
}

interface State {
  proposal: Proposal
}

const initialState: State = {
  proposal: {
    value: '',
    loading: false,
    notFound: false,
  },
}

const slice = createSlice({
  name: 'metadata',
  initialState,
  reducers: {
    reset: () => initialState,
    setProposalPending(state, action: PayloadAction<string>) {
      state.proposal = {
        ...initialState.proposal,
        loading: true,
        value: action.payload,
      }
    },
    setProposalSuccess(state) {
      state.proposal.loading = false
    },
    setProposalNotFound(state) {
      state.proposal.loading = false
      state.proposal.notFound = true
    },
  },
})

export default slice.reducer
export const {
  setProposalPending,
  setProposalSuccess,
  setProposalNotFound,
  reset: resetMetadata,
} = slice.actions
