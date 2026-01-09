import { BASE_URL } from '@damnit-frontend/ui'

import { getExampleIndex } from '../../utils'

export async function load() {
  const index = await getExampleIndex()

  const examples = await Promise.all(
    Object.entries(index).map(async ([id, example]) => {
      const result = await fetch(
        `${BASE_URL}${example.base_path}/metadata.json`
      )
      if (!result.ok) {
        throw new Response(`Failed to fetch metadata for ${id}`, {
          status: result.status,
        })
      }

      const metadata = await result.json()
      return { id, label: example.label, ...metadata }
    })
  )

  return examples
}
