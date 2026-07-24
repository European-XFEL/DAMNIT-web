import type { PropsWithChildren } from 'react'
import { useEffect } from 'react'
import { ApolloClient, ApolloLink, Observable, gql } from '@apollo/client'
import { ApolloProvider, useQuery } from '@apollo/client/react'
import { Provider } from 'react-redux'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test, vi } from 'vitest'

import { resetProposal } from '#src/app/store/actions'
import { useAppDispatch } from '#src/app/store/hooks'
import { setupStore, type AppStore } from '#src/app/store/store'
import { setProposalPending } from '#src/data/metadata/metadata.slice'
import { LIGHTWEIGHT_TABLE_DATA_QUERY } from '#src/data/table/table-data.queries'
import { cache } from '#src/graphql/apollo'

// Leaving a proposal evicts its Apollo entries. The two things that has to get
// right, one test each: the departed proposal is actually gone from the cache,
// and the eviction is late enough that it does not send the departing watcher
// back to the network.

// The home page's list, keyed by proposal_numbers rather than by a proposal.
const PROPOSAL_LIST = gql`
  query ProposalList($proposal_numbers: [Int!]!) {
    proposal_metadata(proposal_numbers: $proposal_numbers) {
      number
    }
  }
`

function runsPayload(proposal: string) {
  return {
    runs: [
      {
        __typename: 'DamnitRun',
        database: proposal,
        proposal,
        run: 1,
        cells: [
          {
            __typename: 'Cell',
            name: 'energy',
            value: 10,
            dtype: 'number',
            error: null,
          },
        ],
      },
    ],
  }
}

function createNetwork() {
  const proposals: string[] = []

  const link = new ApolloLink((operation) => {
    const proposal = operation.variables.proposal as string
    proposals.push(proposal)
    return new Observable((observer) => {
      observer.next({ data: runsPayload(proposal) })
      observer.complete()
    })
  })

  return {
    link,
    requestsFor: (proposal: string) =>
      proposals.filter((seen) => seen === proposal).length,
    clear: () => {
      proposals.length = 0
    },
  }
}

// The one watched runs query, the render source the grid reads from.
function RunsWatcher({ proposal }: { proposal: string }) {
  useQuery(LIGHTWEIGHT_TABLE_DATA_QUERY, {
    variables: { proposal, page: 1, per_page: 10 },
    fetchPolicy: 'cache-and-network',
  })
  return null
}

// Mirrors the app's ProposalWrapper: keyed on the proposal, so a switch unmounts
// this subtree, and its cleanup is what tells the store the proposal is gone.
function ProposalWrapper({
  proposal,
  children,
}: PropsWithChildren<{ proposal: string }>) {
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(setProposalPending(proposal))
    return () => {
      dispatch(resetProposal())
    }
  }, [proposal, dispatch])

  return <>{children}</>
}

function tree(store: AppStore, client: ApolloClient<object>, proposal: string) {
  return (
    <Provider store={store}>
      <ApolloProvider client={client}>
        <ProposalWrapper key={proposal} proposal={proposal}>
          <RunsWatcher proposal={proposal} />
        </ProposalWrapper>
      </ApolloProvider>
    </Provider>
  )
}

// Everything in the cache belonging to a proposal: the ROOT_QUERY fields keyed
// by its number, and the normalized runs those fields point at.
function cacheEntriesFor(proposal: string) {
  const snapshot = cache.extract() as Record<string, object>
  return Object.entries(snapshot)
    .flatMap(([id, entry]) => (id === 'ROOT_QUERY' ? Object.keys(entry) : [id]))
    .filter((key) => key.includes(`"proposal":"${proposal}"`))
}

beforeEach(async () => {
  await cache.reset()
})

test('leaving a proposal keeps the shared proposal list', async () => {
  const network = createNetwork()
  const store = setupStore()
  const client = new ApolloClient({ cache, link: network.link })

  // The home page's proposal list is not scoped to any one proposal, and the
  // eviction picks its fields out of ROOT_QUERY by matching the departed
  // proposal in their arguments. Nothing else pins that the list survives.
  cache.writeQuery({
    query: PROPOSAL_LIST,
    variables: { proposal_numbers: [6996] },
    data: { proposal_metadata: [{ __typename: 'ProposalMeta', number: 6996 }] },
  })

  const screen = await render(tree(store, client, 'A'))
  await vi.waitFor(() => expect(cacheEntriesFor('A')).not.toHaveLength(0))

  await screen.rerender(tree(store, client, 'B'))

  await vi.waitFor(() => expect(cacheEntriesFor('A')).toHaveLength(0))
  expect(
    Object.keys(cache.extract().ROOT_QUERY as object).filter((field) =>
      field.startsWith('proposal_metadata')
    )
  ).not.toHaveLength(0)
})

test('leaving a proposal drops its cached runs', async () => {
  const network = createNetwork()
  const store = setupStore()
  const client = new ApolloClient({ cache, link: network.link })

  const screen = await render(tree(store, client, 'A'))
  await vi.waitFor(() => expect(cacheEntriesFor('A')).not.toHaveLength(0))

  await screen.rerender(tree(store, client, 'B'))

  await vi.waitFor(() => {
    expect(cacheEntriesFor('A')).toHaveLength(0)
    expect(cacheEntriesFor('B')).not.toHaveLength(0)
  })
})

test('leaving a proposal does not refetch the one just left', async () => {
  const network = createNetwork()
  const store = setupStore()
  const client = new ApolloClient({ cache, link: network.link })

  const screen = await render(tree(store, client, 'A'))
  await vi.waitFor(() => expect(network.requestsFor('A')).toBeGreaterThan(0))
  network.clear()

  // Switching proposals unmounts A's subtree. The eviction waits for A's
  // watcher to unsubscribe, so dropping A's fields dirties nothing still live.
  await screen.rerender(tree(store, client, 'B'))
  await new Promise((resolve) => setTimeout(resolve, 250))

  expect(network.requestsFor('A')).toBe(0)
  expect(network.requestsFor('B')).toBeGreaterThan(0)
})
