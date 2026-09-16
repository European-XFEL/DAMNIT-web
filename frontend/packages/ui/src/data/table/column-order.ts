import type { Variable } from './table-data.types'

// The user's order laid over the server's, by TanStack's columnOrder rules: an
// unknown name is skipped, and unlisted columns follow in server order.
function listedFirst(variables: Variable[], order: string[]) {
  const rest = new Map(variables.map((variable) => [variable.name, variable]))

  const listed = []
  for (const name of order) {
    const variable = rest.get(name)
    if (variable === undefined) {
      continue
    }

    listed.push(variable)
    rest.delete(name)
  }

  return [...listed, ...rest.values()]
}

// Each group's members brought together where its first member sits, keeping
// their order. A split group would draw its header as two boxes in the grid.
function gatherGroups(variables: Variable[]) {
  // A Map keeps its keys in first-seen order, which is where each group goes.
  const blocks = new Map<string, Variable[]>()
  for (const variable of variables) {
    const key =
      variable.group == null
        ? `variable:${variable.name}`
        : `group:${variable.group}`

    const block = blocks.get(key)
    if (block === undefined) {
      blocks.set(key, [variable])
    } else {
      block.push(variable)
    }
  }

  return [...blocks.values()].flat()
}

export function applyColumnOrder(
  variables: Variable[],
  order: string[]
): Variable[] {
  return gatherGroups(listedFirst(variables, order))
}
