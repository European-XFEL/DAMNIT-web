import { expect, test } from 'vitest'

import { authApi, type UserInfo } from '#src/features/auth/auth.api'
import { selectUserFullName } from '#src/features/auth/auth.slice'
import { contextfileApi } from '#src/features/context-file/context-file.api'
import { resetProposal } from '#src/app/store/actions'
import type { RootState } from '#src/app/store/reducer'
import { setupStore } from '#src/app/store/store'

// Leaving a proposal returns every proposal-scoped redux slice to its initial
// state and drops the RTK Query context-file cache. The Apollo cache is left
// warm on purpose (a run is keyed by database, proposal, run), and the session
// (authApi) survives.

// upsertQueryData pipes the value through transformResponse, so the fixture
// feeds the wire shape. Handing it a UserInfo instead leaves proposals
// undefined, since transformResponse reads proposals_by_year_half.
const user = {
  uid: 1,
  username: 'alovelace',
  name: 'Ada Lovelace',
  email: 'ada@example.org',
  proposals_by_year_half: { '202401': [6996] },
} as unknown as UserInfo

// Every slice the store owns except the two RTK Query caches, read off the
// store itself so a slice added later is covered without touching this file.
const apiPaths: string[] = [authApi.reducerPath, contextfileApi.reducerPath]
const proposalSlices = (
  Object.keys(setupStore().getState()) as (keyof RootState)[]
).filter((key) => !apiPaths.includes(key))

// Dirty each slice on its own. A single store-wide deep-equal would stay green
// for a slice that is already at its initial state, and so would miss a slice
// that never got an addCase.
test.each(proposalSlices)(
  '%s returns to its initial state on resetProposal',
  (key) => {
    const initial = setupStore().getState()[key]
    const store = setupStore({ [key]: { __dirty: true } } as Partial<RootState>)

    store.dispatch(resetProposal())

    expect(store.getState()[key]).toEqual(initial)
  }
)

test('resetProposal keeps the user signed in', async () => {
  const store = setupStore()
  await store.dispatch(
    authApi.util.upsertQueryData('getUserInfo', undefined, user)
  )

  store.dispatch(resetProposal())

  expect(selectUserFullName(store.getState())).toBe('Ada Lovelace')
})
