import type { DropResult } from '@hello-pangea/dnd'

import type { ChangedColumns } from '#src/features/table/types/table.types'
import type {
  Column,
  ColumnBlock,
  ColumnGroupBlock,
} from '#src/features/table/utils/column-blocks'
import { itemsOf } from '#src/utils/variable-blocks'

// One list for the blocks and one per group for its members. They never share
// a type, which is what keeps a member out of a group it does not belong to.
export const BLOCKS_DROPPABLE = 'blocks'
const MEMBERS_PREFIX = 'members:'

export function membersDroppable(group: string) {
  return `${MEMBERS_PREFIX}${group}`
}

const columnName = (column: Column) => column.name

// The list with one item taken out and put back in at `to`.
function moveItem<Item>(
  items: Item[],
  { from, to }: { from: number; to: number }
) {
  const rest = items.filter((_, index) => index !== from)
  return [...rest.slice(0, to), items[from], ...rest.slice(to)]
}

function toColumnOrder(blocks: ColumnBlock[]) {
  return itemsOf(blocks).map(columnName)
}

function membersOf(blocks: ColumnBlock[], group: string) {
  return blocks.find(
    (block): block is ColumnGroupBlock =>
      block.kind === 'group' && block.name === group
  )?.members
}

// The new column order after one drop and what the drop moved, or null
// when there is nothing to write.
export function reorderColumns(
  blocks: ColumnBlock[],
  { source, destination }: DropResult
): { order: string[]; moved: ChangedColumns } | null {
  if (
    destination == null ||
    destination.droppableId !== source.droppableId ||
    destination.index === source.index
  ) {
    return null
  }

  const move = { from: source.index, to: destination.index }

  if (source.droppableId === BLOCKS_DROPPABLE) {
    const dragged = blocks[source.index]

    return {
      order: toColumnOrder(moveItem(blocks, move)),
      moved: {
        columns: toColumnOrder([dragged]),
        groups: dragged.kind === 'group' ? [dragged.name] : [],
      },
    }
  }

  const group = source.droppableId.slice(MEMBERS_PREFIX.length)
  const members = membersOf(blocks, group)
  if (members === undefined) {
    return null
  }

  const memberOrder = moveItem(members, move).map(columnName)

  return {
    order: blocks.flatMap((block) =>
      block.kind === 'group' && block.name === group
        ? memberOrder
        : toColumnOrder([block])
    ),
    moved: { columns: [members[source.index].name], groups: [] },
  }
}
