import { http, HttpResponse, graphql } from 'msw'

import {
  shapeMetadata,
  shapeTableData,
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

  if (!result.ok) {
    throw new Response(`Failed to fetch runs for "${proposal}"`, {
      status: result.status,
    })
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

  if (!result.ok) {
    throw new Response(
      `Failed to fetch data for "${proposal}:${run}:${variable}"`,
      {
        status: result.status,
      }
    )
  }
  return await result.json()
}

async function buildTableData(proposal: string, names?: string[] | null) {
  const { data } = await fetchRuns(proposal)
  return shapeTableData(data, { names })
}

const gqlHandlers = [
  api.query('TableMetadataQuery', async ({ variables }) => {
    const { meta } = await fetchRuns(variables.proposal)

    return HttpResponse.json({
      data: {
        metadata: shapeMetadata(meta),
      },
    })
  }),
  api.query('TableDataQuery', async ({ variables }) => {
    const data = await buildTableData(variables.proposal, variables.names)
    return HttpResponse.json({ data })
  }),
  api.query('LightweightTableDataQuery', async ({ variables }) => {
    const data = await buildTableData(variables.proposal, variables.names)
    return HttpResponse.json({ data })
  }),
  api.query('DeferredTableDataQuery', async ({ variables }) => {
    const data = await buildTableData(variables.proposal, variables.names)
    return HttpResponse.json({ data })
  }),
  api.query('ExtractedDataQuery', async ({ variables }) => {
    const data = await fetchData({
      proposal: variables.proposal,
      run: variables.run,
      variable: variables.variable,
    })

    return HttpResponse.json({
      data: {
        extracted_data: data,
      },
    })
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
]

export const handlers = [...gqlHandlers, ...restHandlers]
