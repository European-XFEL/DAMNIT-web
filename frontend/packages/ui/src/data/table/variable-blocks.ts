import { getColumnTitle, getGroupTitle } from '#src/data/table/column-title'
import { getVariableTitle } from '#src/data/table/table-data.transforms'
import type { TableMeta, Variable } from '#src/data/table/table-data.types'
import type {
  VariableBlock,
  VariableGroupBlock,
  VariableItem,
} from '#src/utils/variable-blocks'

type BuildVariableBlocksOptions<Item extends VariableItem> = {
  groups: TableMeta['groups']
  // What a list adds to each variable, like the table's visibility.
  toItem: (variable: Variable, item: VariableItem) => Item
}

// The variables walked into blocks in table order: a group goes in where its
// first member appears and carries the rest; an ungrouped variable stands alone.
export function buildVariableBlocks<Item extends VariableItem>(
  variables: Variable[],
  { groups, toItem }: BuildVariableBlocksOptions<Item>
): VariableBlock<Item>[] {
  const blocks: VariableBlock<Item>[] = []
  const blockByGroup = new Map<string, VariableGroupBlock<Item>>()

  for (const variable of variables) {
    const title = getVariableTitle(variable)
    const item = toItem(variable, {
      name: variable.name,
      title,
      columnTitle: getColumnTitle({ title, group: variable.group }, groups),
    })

    const group = variable.group
    if (group == null) {
      blocks.push({ kind: 'variable', ...item })
      continue
    }

    const block = blockByGroup.get(group)
    if (block === undefined) {
      const created: VariableGroupBlock<Item> = {
        kind: 'group',
        name: group,
        title: getGroupTitle(group, groups),
        members: [item],
      }
      blockByGroup.set(group, created)
      blocks.push(created)
    } else {
      block.members.push(item)
    }
  }

  return blocks
}
