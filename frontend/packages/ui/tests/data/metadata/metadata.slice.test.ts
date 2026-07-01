import { describe, expect, test } from 'vitest'

import reducer, {
  setProposalNotFound,
  setProposalPending,
  setProposalSuccess,
} from '@/data/metadata/metadata.slice'

describe('proposal lifecycle', () => {
  test('pending sets the value, starts loading and clears a prior notFound', () => {
    let state = reducer(undefined, setProposalNotFound())
    expect(state.proposal.notFound).toBe(true)

    state = reducer(state, setProposalPending('1234'))
    expect(state.proposal).toEqual({
      value: '1234',
      loading: true,
      notFound: false,
    })
  })

  test('success stops loading and keeps the value', () => {
    let state = reducer(undefined, setProposalPending('1234'))
    state = reducer(state, setProposalSuccess())
    expect(state.proposal.loading).toBe(false)
    expect(state.proposal.value).toBe('1234')
  })

  test('notFound stops loading and flags the proposal as missing', () => {
    let state = reducer(undefined, setProposalPending('1234'))
    state = reducer(state, setProposalNotFound())
    expect(state.proposal.loading).toBe(false)
    expect(state.proposal.notFound).toBe(true)
  })
})
