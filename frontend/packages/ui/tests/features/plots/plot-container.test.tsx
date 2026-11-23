import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { print } from 'graphql'
import { render } from 'vitest-browser-react'
import { expect, test } from 'vitest'

import { previewRunFields } from '@damnit-frontend/shared/mocks'
import { setupStore } from '#src/app/store/store'
import { setProposalPending } from '#src/data/metadata/metadata.slice'
import { TABLE_META_QUERY } from '#src/data/table/table-data.queries'
import PlotContainer from '#src/features/plots/plot-container'
import { PREVIEW_DATA_QUERY_NAME } from '#src/graphql/operation-names'
import { typePolicies } from '#src/graphql/type-policies'
import { withProviders } from '#tests/support/render'

const PROPOSAL = '6996'
const VARIABLE = 'xgm'
const RUNS = [1, 2, 3]

const noValueFor = () => ({
  data: null,
  name: VARIABLE,
  dtype: 'none',
  attrs: {},
})

// A down server fails the whole request, as a lost connection does, and a
// raising one answers each run with a field error, as an unreadable file does.
function createServer(
  valueFor: (run: number) => unknown,
  { raising = false } = {}
) {
  let down = false
  let previewsSent = 0

  const link = new ApolloLink((operation) => {
    if (operation.operationName !== PREVIEW_DATA_QUERY_NAME) {
      return Observable.of()
    }

    previewsSent += 1
    const fields = previewRunFields(print(operation.query))

    return new Observable((observer) => {
      setTimeout(() => {
        if (down) {
          observer.error(new Error('Failed to fetch'))
          return
        }

        observer.next({
          data: Object.fromEntries(
            fields.map(({ alias, run }) => [
              alias,
              raising ? null : valueFor(run),
            ])
          ),
          errors: raising
            ? fields.map(({ alias }) => ({
                message: 'Unable to read the run',
                path: [alias],
              }))
            : undefined,
        })
        observer.complete()
      })
    })
  })

  return {
    link,
    previewsSent: () => previewsSent,
    goDown: () => {
      down = true
    },
    comeBack: () => {
      down = false
    },
  }
}

async function renderPreview(server: ReturnType<typeof createServer>) {
  const store = setupStore()
  store.dispatch(setProposalPending(PROPOSAL))

  const cache = new InMemoryCache({ typePolicies })
  cache.writeQuery({
    query: TABLE_META_QUERY,
    variables: { proposal: PROPOSAL },
    data: {
      metadata: {
        runs: RUNS.map((run) => ({ proposal: PROPOSAL, run })),
        variables: {},
        tags: {},
        groups: {},
      },
    },
  })
  const client = new ApolloClient({ cache, link: server.link })

  return render(
    <PlotContainer
      plot={{
        source: 'preview',
        variables: [VARIABLE],
        runs: RUNS.map(String),
      }}
    />,
    { wrapper: withProviders({ store, client }) }
  )
}

test('a preview whose runs all come back empty says so instead of loading', async () => {
  const server = createServer(noValueFor)

  const screen = await renderPreview(server)

  await expect
    .element(screen.getByText('Unable to display the plot'))
    .toBeVisible()
  await expect
    .element(screen.getByText('None of its runs has data that can be plotted.'))
    .toBeVisible()
})

test('a preview that failed to load asks for its data again on Try again', async () => {
  const server = createServer((run) => ({
    data: `data:image/png;base64,run${run}`,
    name: VARIABLE,
    dtype: 'image',
    attrs: { shape: [4, 4] },
  }))
  server.goDown()

  const screen = await renderPreview(server)

  await expect
    .element(screen.getByText('Unable to load the plot'))
    .toBeVisible()

  // The connection is back.
  server.comeBack()
  await screen.getByRole('button', { name: 'Try again' }).click()

  await expect.element(screen.getByRole('img')).toBeVisible()
  expect(server.previewsSent()).toBe(2)
})
