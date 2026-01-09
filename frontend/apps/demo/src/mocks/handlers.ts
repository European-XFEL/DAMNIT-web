import { HttpResponse, graphql } from 'msw'

import { BASE_URL } from '@damnit-frontend/ui'

import { getExampleIndex } from '../utils'

const api = graphql.link(`${BASE_URL}graphql`)
const exampleIndex = await getExampleIndex()

export async function getRuns(proposal: string) {
  const result = await fetch(
    `${BASE_URL}${exampleIndex[proposal].base_path}/runs.json`
  )

  if (!result.ok) {
    throw new Response(`Failed to fetch data for "${proposal}"`, {
      status: result.status,
    })
  }
  return await result.json()
}

const gqlHandlers = [
  api.mutation('RefreshMutation', async ({ variables }) => {
    const { metadata } = await getRuns(variables.proposal)

    return HttpResponse.json({
      data: {
        refresh: {
          metadata,
        },
      },
    })
  }),
  api.query('TableMetadataQuery', async ({ variables }) => {
    const { metadata } = await getRuns(variables.proposal)

    return HttpResponse.json({
      data: {
        metadata,
      },
    })
  }),
  api.query('TableDataQuery', async ({ variables }) => {
    const { data } = await getRuns(variables.proposal)

    return HttpResponse.json({
      data: {
        runs: (data as Record<string, unknown>[]).map((run) => ({
          ...run,
          __typename: variables.proposal,
        })),
      },
    })
  }),
]

export const handlers = [...gqlHandlers]
