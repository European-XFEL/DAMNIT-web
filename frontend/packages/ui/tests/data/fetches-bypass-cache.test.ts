import { afterEach, expect, test, vi } from 'vitest'

import TableDataServices from '@/data/table/table-data.services'
import ExtractedDataServices from '@/data/extracted/extracted-data.services'
import { cache } from '@/graphql/apollo'

// Redux is the render source for runs and extracted_data, so their fetches run
// no-cache and must leave the Apollo cache untouched. That is what makes
// resetProposal's eviction stick: a fetch that resolves after teardown has
// nothing to write back into ROOT_QUERY, so reopening the proposal can't read a
// stale field. A real cache behind a stub link makes the write observable.
vi.mock('@/graphql/apollo', async () => {
  const { ApolloClient, ApolloLink, InMemoryCache, Observable } = await import(
    '@apollo/client'
  )

  const cache = new InMemoryCache()
  const link = new ApolloLink(
    () =>
      new Observable((observer) => {
        observer.next({
          data: {
            runs: [
              {
                variables: [
                  { name: 'run', value: 7, dtype: 'number', error: null },
                ],
              },
            ],
            extracted_data: 'stub',
          },
        })
        observer.complete()
      })
  )

  return { cache, client: new ApolloClient({ cache, link }) }
})

const PROPOSAL = '6996'

function rootQueryFields() {
  const rootQuery = cache.extract().ROOT_QUERY ?? {}
  return Object.keys(rootQuery)
    .filter((key) => key !== '__typename')
    .map((key) => key.split('(')[0])
}

afterEach(async () => {
  await cache.reset()
})

test('getTableData does not write its runs into the Apollo cache', async () => {
  await TableDataServices.getTableData({ proposal: PROPOSAL, variables: [] })

  expect(rootQueryFields()).toEqual([])
})

test('getExtractedValue does not write its extracted_data into the Apollo cache', async () => {
  await ExtractedDataServices.getExtractedValue({
    proposal: PROPOSAL,
    run: '7',
    variable: 'image',
  })

  expect(rootQueryFields()).toEqual([])
})
