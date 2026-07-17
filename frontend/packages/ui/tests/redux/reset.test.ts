import { expect, test, vi } from 'vitest'
import { gql } from '@apollo/client'

import { cache } from '@/graphql/apollo'
import { authApi, type UserInfo } from '@/auth/auth.api'
import { selectUserFullName } from '@/auth/auth.slice'
import { contextfileApi } from '@/features/context-file/context-file.api'
import { getTable, updateTable } from '@/data/table/table-data.slice'
import { resetProposal } from '@/redux/actions'
import type { RootState } from '@/redux/reducer'
import { setupStore } from '@/redux/store'

// Leaving a proposal drops every proposal-scoped cache, in both Apollo and RTK
// Query. Only the session (authApi) and the proposal list (proposal_metadata)
// survive.

// A real cache, so the eviction below is observable. The slices reach the
// client through their services, and importing the real one opens a websocket
// from a Node test.
vi.mock('@/graphql/apollo', async () => {
  const { InMemoryCache } = await import('@apollo/client')
  return { cache: new InMemoryCache(), client: {} }
})

// getTable normally reaches the network through the client; stub the service so
// the thunk resolves without one, letting the stale-fetch guard be exercised.
vi.mock('@/data/table/table-data.services', () => ({
  default: {
    getTable: vi.fn(async () => ({
      data: { '7': { run: { value: 7, dtype: 'number' } } },
      metadata: { variables: {}, runs: ['7'], timestamp: 1, tags: {} },
    })),
  },
}))

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

async function signedInStoreShowingRun() {
  const store = setupStore()

  await store.dispatch(
    authApi.util.upsertQueryData('getUserInfo', undefined, user)
  )
  store.dispatch(
    updateTable({
      data: { '5': { run: { value: 5, dtype: 'number' } } },
      metadata: {
        variables: { run: { name: 'run', tags: [] } },
        runs: ['5'],
        timestamp: 1,
        tags: {},
      },
    })
  )

  return store
}

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

// The dashboard's three root fields alongside the home page's, each with the
// arguments the real queries send, so eviction has to match every variant.
const CACHED_FIELDS = gql`
  query Cached($proposal: String) {
    runs(database: { proposal: $proposal })
    metadata(database: { proposal: $proposal })
    extracted_data(database: { proposal: $proposal }, run: 1, variable: "image")
    proposal_metadata(proposal_numbers: [6996]) {
      number
    }
  }
`

test('resetProposal drops the proposal-scoped fields but keeps the proposal list', () => {
  cache.writeQuery({
    query: CACHED_FIELDS,
    variables: { proposal: '6996' },
    data: {
      runs: { '5': { run: 5 } },
      metadata: { runs: ['5'] },
      extracted_data: { value: 'png' },
      proposal_metadata: [{ __typename: 'ProposalMetadata', number: 6996 }],
    },
  })
  const store = setupStore()

  store.dispatch(resetProposal())

  const rootQuery = cache.extract().ROOT_QUERY ?? {}
  const survivors = Object.keys(rootQuery)
    .filter((key) => key !== '__typename')
    .map((key) => key.split('(')[0])
  expect(survivors).toEqual(['proposal_metadata'])
})

test('resetProposal clears the table but keeps the user signed in', async () => {
  const store = await signedInStoreShowingRun()

  store.dispatch(resetProposal())

  expect(store.getState().tableData.data).toEqual({})
  expect(selectUserFullName(store.getState())).toBe('Ada Lovelace')
})

const PROPOSAL = '6996'

function storeOnProposal(value: string) {
  return setupStore({
    metadata: { proposal: { value, loading: false, notFound: false } },
  })
}

test('a table fetch still on the open proposal populates the table', async () => {
  const store = storeOnProposal(PROPOSAL)

  await store.dispatch(getTable({ proposal: PROPOSAL, page: 1, pageSize: 10 }))

  expect(store.getState().tableData.data).toEqual({
    '7': { run: { value: 7, dtype: 'number' } },
  })
})

test('a table fetch that resolves after leaving the proposal is dropped', async () => {
  const store = storeOnProposal(PROPOSAL)

  // The fetch is in flight when the user leaves, so resetProposal runs first
  // and the late fulfillment must not repopulate the reset slice.
  const pending = store.dispatch(
    getTable({ proposal: PROPOSAL, page: 1, pageSize: 10 })
  )
  store.dispatch(resetProposal())
  await pending

  expect(store.getState().tableData.data).toEqual({})
})
