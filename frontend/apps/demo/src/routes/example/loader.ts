import { type LoaderFunctionArgs } from 'react-router'
import { BASE_URL } from '@damnit-frontend/ui'

import { getExampleIndex } from '../../utils'

export async function load({ params }: LoaderFunctionArgs) {
  const index = await getExampleIndex()

  const id = params.example_name
  if (!id || !(id in index)) {
    return {}
  }

  const example = index[id]

  const metaResult = await fetch(
    `${BASE_URL}${example.base_path}/metadata.json`
  )
  if (!metaResult.ok) {
    throw new Response(`Failed to fetch metadata for "${id}"`, {
      status: metaResult.status,
    })
  }

  const metaData = await metaResult.json()

  return { info: { id, label: example.label, ...metaData } }
}
