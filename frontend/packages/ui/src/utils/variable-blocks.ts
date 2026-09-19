// One variable as a list shows it. `title` is whole, so search and screen
// readers get the group's words; `columnTitle` drops what the heading carries.
export type VariableItem = {
  name: string
  title: string
  columnTitle: string
}

// A group and the variables under it. A group travels whole, so its members are
// its own list rather than blocks of their own.
export type VariableGroupBlock<Item extends VariableItem = VariableItem> = {
  kind: 'group'
  name: string
  title: string
  members: Item[]
}

export type VariableBlock<Item extends VariableItem = VariableItem> =
  | ({ kind: 'variable' } & Item)
  | VariableGroupBlock<Item>

// The blocks flattened back to their variables, a group's members side by side.
export function itemsOf<Item extends VariableItem>(
  blocks: VariableBlock<Item>[]
): Item[] {
  return blocks.flatMap((block) =>
    block.kind === 'group' ? block.members : block
  )
}

// Keep a variable when its whole title or its group's matches. A group stays
// while any member is left, so no member shows without its heading.
export function filterVariableBlocks<Item extends VariableItem>(
  blocks: VariableBlock<Item>[],
  query: string
): VariableBlock<Item>[] {
  const search = query.trim().toLowerCase()
  if (search === '') {
    return blocks
  }

  const matches = (title: string) => title.toLowerCase().includes(search)

  return blocks.flatMap((block) => {
    if (block.kind !== 'group') {
      return matches(block.title) ? block : []
    }

    if (matches(block.title)) {
      return block
    }

    const members = block.members.filter((member) => matches(member.title))
    return members.length > 0 ? { ...block, members } : []
  })
}

export function variableKey(name: string) {
  return `variable:${name}`
}

// What names a block within the list it lives in, since a group and a variable
// could be given the same name.
export function blockKey(block: VariableBlock) {
  return block.kind === 'group'
    ? `group:${block.name}`
    : variableKey(block.name)
}
