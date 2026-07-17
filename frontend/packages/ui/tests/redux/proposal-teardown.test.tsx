import type { PropsWithChildren } from 'react'
import { useEffect } from 'react'
import { ApolloClient, ApolloLink, Observable } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { Provider } from 'react-redux'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test, vi } from 'vitest'

import { resetProposal } from '#src/app/store/actions'
import { useAppDispatch } from '#src/app/store/hooks'
import { setupStore, type AppStore } from '#src/app/store/store'
import { setProposalPending } from '#src/data/metadata/metadata.slice'
import TablePageLoader from '#src/features/table/table-page-loader'
import { cache } from '#src/graphql/apollo'

// The real cache and the real resetProposal listener: what this pins is how the
// listener's eviction lands against watchers that are still on their way out.

const PAGES = [1, 2, 3]

const runsPayload = {
  runs: [
    {
      variables: [
        { name: 'run', value: 1, dtype: 'number', error: null },
        { name: 'energy', value: 10, dtype: 'number', error: null },
      ],
    },
  ],
}

function createNetwork() {
  const proposals: string[] = []

  const link = new ApolloLink((operation) => {
    proposals.push(operation.variables.proposal as string)
    return new Observable((observer) => {
      observer.next({ data: runsPayload })
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
          {PAGES.map((page) => (
            <TablePageLoader
              key={page}
              proposal={proposal}
              page={page}
              pageSize={10}
            />
          ))}
        </ProposalWrapper>
      </ApolloProvider>
    </Provider>
  )
}

beforeEach(async () => {
  await cache.reset()
})

test('leaving a proposal does not refetch the one just left', async () => {
  const network = createNetwork()
  const store = setupStore()
  const client = new ApolloClient({ cache, link: network.link })

  const screen = await render(tree(store, client, 'A'))
  await vi.waitFor(() => expect(network.requestsFor('A')).toBeGreaterThan(0))
  network.clear()

  // Switching proposals unmounts A's subtree. React runs its cleanups parent
  // first, so the eviction fires while A's own watchers are still subscribed:
  // an unscoped, synchronous evict dirties them and each one refetches a page
  // of the proposal the user has already left.
  await screen.rerender(tree(store, client, 'B'))
  await new Promise((resolve) => setTimeout(resolve, 250))

  expect(network.requestsFor('A')).toBe(0)
  expect(network.requestsFor('B')).toBeGreaterThan(0)
})
