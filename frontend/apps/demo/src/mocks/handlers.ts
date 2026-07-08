import { http, HttpResponse, graphql } from 'msw'

import {
  MockSeedMiss,
  resolveOperation,
  type MockSeed,
  type Runs,
} from '@damnit-frontend/shared/mocks'
import { BASE_URL } from '@damnit-frontend/ui'

import { getExampleIndex } from '../utils'

const api = graphql.link(`${BASE_URL}graphql`)
const exampleIndex = await getExampleIndex()

async function fetchRuns(proposal: string): Promise<Runs> {
  const result = await fetch(
    `${BASE_URL}${exampleIndex[proposal].base_path}/runs.json`
  )

  if (result.status === 404) {
    throw new MockSeedMiss()
  }
  if (!result.ok) {
    throw new Error(`Failed to fetch runs for "${proposal}" (${result.status})`)
  }
  return await result.json()
}

type FetchDataOptions = {
  proposal: string
  run: number
  variable: string
}

async function fetchData({ proposal, run, variable }: FetchDataOptions) {
  const result = await fetch(
    `${BASE_URL}${exampleIndex[proposal].base_path}/data/${run}/${variable}.json`
  )

  if (result.status === 404) {
    throw new MockSeedMiss()
  }
  if (!result.ok) {
    throw new Error(
      `Failed to fetch data for "${proposal}:${run}:${variable}" (${result.status})`
    )
  }
  return await result.json()
}

const seed: MockSeed = {
  runs: fetchRuns,
  extractedData: fetchData,
  // No proposalMetadata: the demo does not mock it, so ProposalMetadata stays a
  // miss and the resolver returns the unmocked-operation error the old
  // catch-all produced.
}

const gqlHandlers = [
  api.operation(async ({ operationName, variables }) => {
    const resolution = await resolveOperation(
      operationName,
      variables as Record<string, unknown>,
      seed
    )
    return HttpResponse.json(resolution.body as Record<string, unknown>)
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
