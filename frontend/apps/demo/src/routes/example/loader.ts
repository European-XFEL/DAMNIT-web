import { type LoaderFunctionArgs } from 'react-router'

import { getExampleIndex } from '../../utils'

export async function load({ params }: LoaderFunctionArgs) {
  const index = await getExampleIndex()

  const id = params.example_name
  if (!id || !(id in index)) {
    return {}
  }

  const example = index[id]

  return { info: { id, ...example } }
}
