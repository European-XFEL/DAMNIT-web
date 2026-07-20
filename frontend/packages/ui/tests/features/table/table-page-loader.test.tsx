import type { PropsWithChildren } from 'react'
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { Provider } from 'react-redux'
import { render } from 'vitest-browser-react'
import { expect, test, vi } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import { updateTable } from '#src/data/table/table-data.slice'
import TablePageLoader from '#src/features/table/table-page-loader'

const PROPOSAL = '6996'

// The server blanks heavy values under @lightweight and fills them in on the
// deferred follow-up, so the two operations answer differently. `energy` models
// a scalar the server has since recomputed: it rides along on the lightweight
// pass, which is what makes that response change while the heavy one does not.
// Omitting `names` asks for every variable, exactly as the schema defines it.
const responseFor = (
  operationName: string,
  { names, energy }: { names?: string[]; energy: number }
) => {
  const lightweight = operationName === 'LightweightTableDataQuery'
  const variables = [
    { name: 'run', value: 1, dtype: 'number', error: null },
    { name: 'energy', value: energy, dtype: 'number', error: null },
    {
      name: 'spectrum',
      value: lightweight ? null : [1, 2, 3],
      dtype: 'array',
      error: null,
    },
  ]

  return {
    runs: [
      {
        variables: variables.filter(
          (variable) => names == null || names.includes(variable.name)
        ),
      },
    ],
  }
}

type SeenOperation = { name: string; variables: Record<string, unknown> }

// A link that records what was asked and answers only when told to, so a test
// can inspect the gap between a request going out and its rows arriving.
function createNetwork() {
  const operations: SeenOperation[] = []
  let pending: Array<() => void> = []
  let energy = 10

  const link = new ApolloLink((operation) => {
    operations.push({
      name: operation.operationName,
      variables: operation.variables,
    })
    return new Observable((observer) => {
      pending.push(() => {
        observer.next({
          data: responseFor(operation.operationName, {
            names: operation.variables.names as string[] | undefined,
            energy,
          }),
        })
        observer.complete()
      })
    })
  })

  const namesOf = (name: string) => operations.filter((op) => op.name === name)

  return {
    link,
    operations,
    lightweight: () => namesOf('LightweightTableDataQuery'),
    deferred: () => namesOf('DeferredTableDataQuery'),
    recompute: (value: number) => {
      energy = value
    },
    deliver: () => {
      const ready = pending
      pending = []
      ready.forEach((send) => send())
    },
  }
}

function makeWrapper(store: AppStore, client: ApolloClient<object>) {
  return function Providers({ children }: PropsWithChildren) {
    return (
      <Provider store={store}>
        <ApolloProvider client={client}>{children}</ApolloProvider>
      </Provider>
    )
  }
}

const loader = <TablePageLoader proposal={PROPOSAL} page={2} pageSize={10} />

const rowsIn = (store: AppStore) => store.getState().tableData.data

test('a mounted loader dispatches its page rows, then fetches the values the server held back', async () => {
  const network = createNetwork()
  const store = setupStore()
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: network.link,
  })

  await render(loader, { wrapper: makeWrapper(store, client) })

  // The lightweight pass asks for the whole page, no names: every variable,
  // with the heavy ones blanked.
  expect(network.lightweight()).toHaveLength(1)
  expect(network.lightweight()[0].variables).toEqual({
    proposal: PROPOSAL,
    page: 2,
    per_page: 10,
  })

  network.deliver()

  // The blanked cell lands as a null, which is what the grid draws as a loading
  // skeleton until the deferred pass fills it in.
  await vi.waitFor(() => {
    expect(rowsIn(store)['1'].spectrum.value).toBeNull()
  })

  // Learning which values were blanked is what drives the second pass, and it
  // asks for `run` too, since that is what keys the rows it fills in.
  await vi.waitFor(() => {
    expect(network.deferred()).toHaveLength(1)
  })
  expect(network.deferred()[0].variables).toEqual({
    proposal: PROPOSAL,
    page: 2,
    per_page: 10,
    names: ['run', 'spectrum'],
  })

  network.deliver()

  await vi.waitFor(() => {
    expect(rowsIn(store)['1'].spectrum.value).toEqual([1, 2, 3])
  })
})

test('a loader unmounted before its rows arrive dispatches nothing', async () => {
  const network = createNetwork()
  const store = setupStore()
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: network.link,
  })

  const screen = await render(loader, { wrapper: makeWrapper(store, client) })
  expect(network.lightweight()).toHaveLength(1)

  // Leaving the proposal unmounts the loader while its page is still in
  // flight. The unmounted hook drops the late rows, so they can never refill
  // the slice that teardown just reset.
  await screen.unmount()
  network.deliver()

  await new Promise((resolve) => setTimeout(resolve))
  expect(rowsIn(store)).toEqual({})
})

test('a revalidated page keeps the heavy values the deferred pass filled in', async () => {
  const network = createNetwork()
  const store = setupStore()
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: network.link,
  })

  // Load the page once, so both passes have run and the heavy value is in place.
  const first = await render(loader, { wrapper: makeWrapper(store, client) })
  network.deliver()
  await vi.waitFor(() => expect(network.deferred()).toHaveLength(1))
  network.deliver()
  await vi.waitFor(() => {
    expect(rowsIn(store)['1'].spectrum.value).toEqual([1, 2, 3])
  })
  await first.unmount()

  // Scrolling the page back into view remounts its loader, and the server has
  // recomputed a scalar meanwhile. The lightweight pass answers first, carrying
  // the new scalar and blanking the heavy cell again.
  network.recompute(20)
  await render(loader, { wrapper: makeWrapper(store, client) })
  await vi.waitFor(() => expect(network.lightweight()).toHaveLength(2))
  network.deliver()
  await vi.waitFor(() => {
    expect(rowsIn(store)['1'].energy.value).toBe(20)
  })

  // The held-back guard keeps the heavy value the first pass filled in, so the
  // cell never flashes blank while the deferred pass is still on its way.
  expect(rowsIn(store)['1'].spectrum.value).toEqual([1, 2, 3])

  // The deferred pass then refetches and refills it, unchanged.
  await vi.waitFor(() => expect(network.deferred()).toHaveLength(2))
  network.deliver()
  await vi.waitFor(() => {
    expect(rowsIn(store)['1'].spectrum.value).toEqual([1, 2, 3])
  })
})

test('a live value is not rolled back when its page is revisited', async () => {
  const network = createNetwork()
  const store = setupStore()
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: network.link,
  })

  // Load the page once, then leave it, the way scrolling it off screen does.
  const first = await render(loader, { wrapper: makeWrapper(store, client) })
  network.deliver()
  await vi.waitFor(() => expect(network.deferred()).toHaveLength(1))
  network.deliver()
  await vi.waitFor(() => expect(rowsIn(store)['1'].energy.value).toBe(10))
  await first.unmount()

  // A subscription pushes a newer scalar while the page is off screen. It writes
  // only to the slice, so the page's would-be cache entry stays at the old 10.
  store.dispatch(
    updateTable({
      data: { '1': { energy: { value: 99, dtype: 'number' } } },
      live: true,
    })
  )
  expect(rowsIn(store)['1'].energy.value).toBe(99)

  // Scrolling back remounts the loader, which refetches rather than replaying a
  // stale page. Nothing is delivered yet, so the live value stands where a
  // cached replay would have rolled it back to 10.
  network.recompute(99)
  await render(loader, { wrapper: makeWrapper(store, client) })
  await vi.waitFor(() => expect(network.lightweight()).toHaveLength(2))
  expect(rowsIn(store)['1'].energy.value).toBe(99)

  // The fresh answer carries the value the server pushed, so it keeps it there.
  network.deliver()
  await vi.waitFor(() => expect(network.deferred()).toHaveLength(2))
  network.deliver()
  expect(rowsIn(store)['1'].energy.value).toBe(99)
})
