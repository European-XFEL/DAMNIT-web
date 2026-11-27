import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { print } from 'graphql'
import { render } from 'vitest-browser-react'
import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { previewRunFields } from '@damnit-frontend/shared/mocks'
import { setupStore } from '#src/app/store/store'
import {
  ViewStatusProvider,
  ViewStatusTarget,
} from '#src/components/statuses/view-status'
import { setProposalPending } from '#src/data/metadata/metadata.slice'
import PlotContainer from '#src/features/plots/plot-container'
import { PREVIEW_DATA_QUERY_NAME } from '#src/graphql/operation-names'
import { typePolicies } from '#src/graphql/type-policies'
import { writeMetadata } from '#tests/support/apollo'
import { withProviders } from '#tests/support/render'

const PROPOSAL = '6996'
const VARIABLE = 'xgm'
const RUNS = [1, 2, 3]

const imageFor = (run: number) => ({
  data: `data:image/png;base64,run${run}`,
  name: VARIABLE,
  dtype: 'image',
  attrs: { shape: [4, 4] },
})

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
  writeMetadata(cache, {
    proposal: PROPOSAL,
    runs: RUNS.map((run) => ({ proposal: PROPOSAL, run })),
    variables: {},
  })
  const client = new ApolloClient({ cache, link: server.link })

  // The status bar's items draw into its target, outside the plot.
  return render(
    <ViewStatusProvider>
      <PlotContainer
        plot={{
          source: 'preview',
          variables: [VARIABLE],
          runs: RUNS.map(String),
        }}
      />
      <ViewStatusTarget />
    </ViewStatusProvider>,
    { wrapper: withProviders({ store, client }) }
  )
}

test('a preview whose runs all come back empty says so instead of loading', async () => {
  const server = createServer(noValueFor)

  const screen = await renderPreview(server)

  await expect
    .element(screen.getByRole('alert', { name: 'Unable to display the plot' }))
    .toHaveTextContent('None of its runs has data that can be plotted.')
})

test('a preview whose every run raised says it failed to load', async () => {
  const server = createServer(imageFor, { raising: true })

  const screen = await renderPreview(server)

  await expect
    .element(screen.getByRole('alert', { name: 'Unable to load the plot' }))
    .toBeVisible()
})

test('a preview that failed to load asks for its data again on Try again', async () => {
  const server = createServer(imageFor)
  server.goDown()

  const screen = await renderPreview(server)

  await expect
    .element(screen.getByRole('alert', { name: 'Unable to load the plot' }))
    .toBeVisible()

  // The connection is back.
  server.comeBack()
  await screen.getByRole('button', { name: 'Try again' }).click()

  await expect.element(screen.getByRole('img')).toBeVisible()
  expect(server.previewsSent()).toBe(2)
})

test('Try again keeps its focus while the plot asks for its data again', async () => {
  const server = createServer(imageFor)
  server.goDown()

  const screen = await renderPreview(server)
  const tryAgain = screen.getByRole('button', { name: 'Try again' })
  await expect.element(tryAgain).toBeVisible()

  await tryAgain.click()

  await vi.waitFor(() => {
    expect(server.previewsSent()).toBe(2)
  })
  await expect.element(tryAgain).toHaveFocus()
})

test('an image over three runs names the one run it shows in the status bar', async () => {
  const server = createServer(imageFor)

  const screen = await renderPreview(server)
  const item = screen.getByText('Showing: Run 1 only')
  await expect.element(item).toBeVisible()

  await userEvent.hover(item)

  await expect
    .element(screen.getByRole('tooltip'))
    .toHaveTextContent(
      'Images show one run at a time. 2 other runs with data are not shown.'
    )
})
