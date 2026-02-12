import { getExampleIndex } from '../../utils'

export async function load() {
  const index = await getExampleIndex()

  const examples = Object.entries(index).map(([id, example]) => ({
    id,
    ...example,
  }))

  return examples
}
