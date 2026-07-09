import { http, HttpResponse, graphql } from 'msw'

import {
  MockDataNotFound,
  resolveOperation,
  type MockDataSource,
  type Runs,
} from '@damnit-frontend/shared/mocks'
import { BASE_URL } from '@damnit-frontend/ui'

import { getExampleIndex } from '../utils'

const api = graphql.link(`${BASE_URL}graphql`)
const exampleIndex = await getExampleIndex()

async function fetchExample(proposal: string, { path }: { path: string }) {
  const entry = exampleIndex[proposal]
  if (entry === undefined) {
    throw new MockDataNotFound()
  }

  const result = await fetch(`${BASE_URL}${entry.base_path}/${path}`)

  if (result.status === 404) {
    throw new MockDataNotFound()
  }
  if (!result.ok) {
    throw new Error(
      `Failed to fetch "${path}" for "${proposal}" (${result.status})`
    )
  }
  return result.json()
}

type FetchDataOptions = {
  proposal: string
  run: number
  variable: string
}

const fetchRuns = (proposal: string): Promise<Runs> =>
  fetchExample(proposal, { path: 'runs.json' })

const fetchData = ({
  proposal,
  run,
  variable,
}: FetchDataOptions): Promise<unknown> =>
  fetchExample(proposal, { path: `data/${run}/${variable}.json` })

const source: MockDataSource = {
  runs: fetchRuns,
  extractedData: fetchData,
  // The demo does not mock proposal metadata; report it as drift.
  proposalMetadata: async () => {
    throw new MockDataNotFound()
  },
}

const gqlHandlers = [
  api.operation(async ({ operationName, variables }) => {
    const resolution = await resolveOperation(operationName, {
      variables: variables as Record<string, unknown>,
      source,
    })
    return HttpResponse.json(resolution.body)
  }),
]

type FetchContextFileOptions = {
  proposal: string
}

async function fetchContextFile({ proposal }: FetchContextFileOptions) {
  const result = await fetch(
    `${BASE_URL}${exampleIndex[proposal].base_path}/context.py`
  )

  if (!result.ok) {
    throw new Response(`Failed to fetch context file for "${proposal}"`, {
      status: result.status,
    })
  }
  return await result.text()
}

const restHandlers = [
  http.get(`${BASE_URL}contextfile/content`, async ({ request }) => {
    const url = new URL(request.url)
    const proposal_number = url.searchParams.get('proposal_number') ?? ''

    const content = await fetchContextFile({ proposal: proposal_number })
    return HttpResponse.json({
      fileContent: content,
    })
  }),
  http.get(`${BASE_URL}contextfile/last_modified`, () =>
    HttpResponse.json({ lastModified: 0 })
  ),
]

export const handlers = [...gqlHandlers, ...restHandlers]
