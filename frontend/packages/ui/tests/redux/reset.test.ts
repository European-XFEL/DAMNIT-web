import { expect, test, vi } from 'vitest'
import { gql } from '@apollo/client'

import { cache } from '#src/graphql/apollo'
import { authApi, type UserInfo } from '#src/features/auth/auth.api'
import { selectUserFullName } from '#src/features/auth/auth.slice'
import { contextfileApi } from '#src/features/context-file/context-file.api'
import { updateTable } from '#src/data/table/table-data.slice'
import { setProposalPending } from '#src/data/metadata/metadata.slice'
import { resetProposal } from '#src/app/store/actions'
import type { RootState } from '#src/app/store/reducer'
import { setupStore } from '#src/app/store/store'

// Leaving a proposal drops every proposal-scoped cache, in both Apollo and RTK
// Query. Only the session (authApi) and the proposal list (proposal_metadata)
// survive.

// A real cache, so the eviction below is observable. Importing the real module
// opens a websocket from a Node test.
vi.mock('#src/graphql/apollo', async () => {
  const { InMemoryCache } = await import('@apollo/client')
  return { cache: new InMemoryCache(), client: {} }
})

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

function cacheProposal(proposal: string) {
  cache.writeQuery({
    query: CACHED_FIELDS,
    variables: { proposal },
    data: {
      runs: { '5': { run: 5 } },
      metadata: { runs: ['5'] },
      extracted_data: { value: 'png' },
      proposal_metadata: [{ __typename: 'ProposalMetadata', number: 6996 }],
    },
  })
}

const cachedFields = () =>
  Object.keys(cache.extract().ROOT_QUERY ?? {}).filter(
    (key) => key !== '__typename'
  )

// The eviction is deferred past the departing watchers' unsubscribes, so it
// lands a macrotask later rather than within the dispatch.
async function leaveProposal(proposal: string) {
  const store = setupStore()
  store.dispatch(setProposalPending(proposal))
  cacheProposal(proposal)

  store.dispatch(resetProposal())
  await vi.waitFor(() =>
    expect(cachedFields()).not.toContain(
      `metadata({"database":{"proposal":"${proposal}"}})`
    )
  )
}

test('resetProposal drops the departed proposal, keeping the proposal list', async () => {
  await leaveProposal('6996')

  expect(cachedFields().map((key) => key.split('(')[0])).toEqual([
    'proposal_metadata',
  ])
})

test('resetProposal leaves another proposal cached', async () => {
  // What makes the deferred eviction safe: by the time it runs, the proposal
  // being opened may already have cached data of its own, and dropping that
  // would send it straight back to the network.
  cacheProposal('7777')

  await leaveProposal('6996')

  expect(cachedFields()).toContain('metadata({"database":{"proposal":"7777"}})')
})

test('resetProposal clears the table but keeps the user signed in', async () => {
  const store = await signedInStoreShowingRun()

  store.dispatch(resetProposal())

  expect(store.getState().tableData.data).toEqual({})
  expect(selectUserFullName(store.getState())).toBe('Ada Lovelace')
})
