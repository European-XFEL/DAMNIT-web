import { getVariableTitle } from '#src/data/table/table-data.transforms'
import type { TableMeta, Variable } from '#src/data/table/table-data.types'
import {
  getColumnTitle,
  getGroupTitle,
} from '#src/features/table/utils/column-title'

// One column as a list shows it. `title` is whole, so search and screen readers
// get the group's words; `columnTitle` drops what the heading above carries.
export type Column = {
  name: string
  title: string
  columnTitle: string
  isVisible: boolean
  // False for a column the table always shows, like the run number.
  canHide: boolean
  passesTagFilter: boolean
  tags: string[]
}

// A group and the columns under it. A group travels whole, so its members are
// its own list rather than blocks of their own.
export type ColumnGroupBlock = {
  kind: 'group'
  name: string
  title: string
  members: Column[]
}

export type ColumnBlock = ({ kind: 'variable' } & Column) | ColumnGroupBlock

type BuildColumnBlocksOptions = {
  variables: Variable[]
  groups: TableMeta['groups']
  // Only the columns the user can hide have an entry here. A column without one
  // still gets a row, marked as always shown.
  visibility: Record<string, boolean>
  // Which columns the selected tags allow, or null when no tag is selected. A
  // row that fails it still shows, but its checkbox cannot win.
  tagFilter: Record<string, boolean> | null
}

// The variables walked into blocks in table order: a group goes in where its
// first member appears and carries the rest; an ungrouped column stands alone.
export function buildColumnBlocks({
  variables,
  groups,
  visibility,
  tagFilter,
}: BuildColumnBlocksOptions): ColumnBlock[] {
  const blocks: ColumnBlock[] = []
  const blockByGroup = new Map<string, ColumnGroupBlock>()

  for (const variable of variables) {
    const canHide = visibility[variable.name] !== undefined
    const title = getVariableTitle(variable)
    const column = {
      name: variable.name,
      title,
      columnTitle: getColumnTitle({ title, group: variable.group }, groups),
      isVisible: visibility[variable.name] ?? true,
      canHide,
      // The tags filter only what the user can hide, so they never refuse the rest.
      passesTagFilter:
        !canHide || tagFilter == null || !!tagFilter[variable.name],
      tags: variable.tags,
    }

    const group = variable.group
    if (group == null) {
      blocks.push({ kind: 'variable', ...column })
      continue
    }

    const block = blockByGroup.get(group)
    if (block === undefined) {
      const created: ColumnGroupBlock = {
        kind: 'group',
        name: group,
        title: getGroupTitle(group, groups),
        members: [column],
      }
      blockByGroup.set(group, created)
      blocks.push(created)
    } else {
      block.members.push(column)
    }
  }

  return blocks
}

// The blocks flattened back to their columns, a group's members side by side.
export function columnsOf(blocks: ColumnBlock[]): Column[] {
  return blocks.flatMap((block) =>
    block.kind === 'group' ? block.members : block
  )
}

// Keep a column when its whole title or its group's matches. A group stays
// while any member is left, so no member shows without its heading.
export function filterColumnBlocks(
  blocks: ColumnBlock[],
  query: string
): ColumnBlock[] {
  if (query === '') {
    return blocks
  }

  const matches = (title: string) => title.toLowerCase().includes(query)

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
