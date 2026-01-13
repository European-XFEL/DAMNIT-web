import { http, HttpResponse, graphql } from 'msw'

import { BASE_URL } from '@damnit-frontend/ui'

import { getExampleIndex } from '../utils'

type Runs = {
  meta: Meta
  data: Data[]
}

type Meta = {
  sources: Record<string, SourceMeta>
  variables: Record<string, VariableMeta>
  runs: number[]
}

type SourceMeta = {
  proposal_number: number
  title: string
  principal_investigator: string
}

type VariableMeta = {
  name: string
  title: string
}

type Data = {
  source: {
    ref: string
    run_number: number
  }
  variables: Record<string, VariableValue>
}

// TODO: Use types from the shared package
type VariableValue =
  | { dtype: 'number'; value: number }
  | { dtype: 'string'; value: string }

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

function getMetadata(meta: Meta) {
  const withTagIds = Object.entries(meta.variables).map(([name, variable]) => [
    name,
    { ...(variable as Record<string, unknown>), tag_ids: [] },
  ])

  return {
    variables: Object.fromEntries(withTagIds),
    runs: meta.runs,
    timestamp: 0,
    tags: {},
  }
}

const gqlHandlers = [
  api.mutation('RefreshMutation', async ({ variables }) => {
    const { meta } = await fetchRuns(variables.proposal)

    return HttpResponse.json({
      data: {
        refresh: {
          metadata: getMetadata(meta),
        },
      },
    })
  }),
  api.query('TableMetadataQuery', async ({ variables }) => {
    const { meta } = await fetchRuns(variables.proposal)

    return HttpResponse.json({
      data: {
        metadata: getMetadata(meta),
      },
    })
  }),
  api.query('TableDataQuery', async ({ variables }) => {
    const { data } = await fetchRuns(variables.proposal)

    return HttpResponse.json({
      data: {
        runs: data.map((run) => ({
          ...run.variables,
          __typename: variables.proposal,
        })),
      },
    })
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
    const proposal_number = url.searchParams.get('proposal_num') ?? ''

    const content = await fetchContextFile({ proposal: proposal_number })
    return HttpResponse.json({
      fileContent: content,
    })
  }),
]

export const handlers = [...gqlHandlers, ...restHandlers]
