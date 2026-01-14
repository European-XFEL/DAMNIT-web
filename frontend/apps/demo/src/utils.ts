import { BASE_URL } from '@damnit-frontend/ui'

type ExampleIndexEntry = {
  label: string
  base_path: string
}

type ExampleIndex = Record<string, ExampleIndexEntry>

export async function getExampleIndex() {
  const result = await fetch(`${BASE_URL}examples/index.json`)

  if (!result.ok) {
    throw new Response('Failed to fetch index', { status: result.status })
  }
  return (await result.json()) as ExampleIndex
}
