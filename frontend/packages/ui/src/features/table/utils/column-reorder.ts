import type { DropResult } from '@hello-pangea/dnd'

import type { MovedColumns } from '#src/features/table/types/table.types'
import {
  columnsOf,
  type Column,
  type ColumnBlock,
  type ColumnGroupBlock,
} from '#src/features/table/utils/column-blocks'

// One list for the blocks and one per group for its members. They never share
// a type, which is what keeps a member out of a group it does not belong to.
export const BLOCKS_DROPPABLE = 'blocks'
const MEMBERS_PREFIX = 'members:'

export function membersDroppable(group: string) {
  return `${MEMBERS_PREFIX}${group}`
}

const columnName = (column: Column) => column.name

export function columnKey(name: string) {
  return `variable:${name}`
}

// What names a block within the list it lives in, since a group and a column
// could be given the same name. It is also the id the block is dragged by.
export function blockKey(block: ColumnBlock) {
  return block.kind === 'group' ? `group:${block.name}` : columnKey(block.name)
}

type MoveBesideOptions = {
  all: string[]
  shown: string[]
  from: number
  to: number
}

// Where a dropped row lands in the full order: beside its new neighbour. Keys
// rather than rows, since a group on screen may hold only some members.
function moveBeside({ all, shown, from, to }: MoveBesideOptions) {
  const dragged = shown[from]
  const neighbours = shown.filter((_, index) => index !== from)
  const rest = all.filter((key) => key !== dragged)

  // Dropped at the top it leads the row that was there; anywhere else it
  // follows the one above it.
  const leads = to === 0
  const beside = rest.indexOf(neighbours[leads ? 0 : to - 1])
  const at = leads ? beside : beside + 1

  return [...rest.slice(0, at), dragged, ...rest.slice(at)]
}

function toColumnOrder(blocks: ColumnBlock[]) {
  return columnsOf(blocks).map(columnName)
}

function membersOf(blocks: ColumnBlock[], group: string) {
  return blocks.find(
    (block): block is ColumnGroupBlock =>
      block.kind === 'group' && block.name === group
  )?.members
}

type OrderLists = {
  // Every block in table order, which the new order is written against, and the
  // ones the search left on screen, which is what a drop's indices count.
  blocks: ColumnBlock[]
  shown: ColumnBlock[]
}

// The new column order after one drop and what the drop moved, or null
// when there is nothing to write.
export function reorderColumns(
  { blocks, shown }: OrderLists,
  { source, destination }: DropResult
): { order: string[]; moved: MovedColumns } | null {
  if (
    destination == null ||
    destination.droppableId !== source.droppableId ||
    destination.index === source.index
  ) {
    return null
  }

  if (source.droppableId === BLOCKS_DROPPABLE) {
    const keys = moveBeside({
      all: blocks.map(blockKey),
      shown: shown.map(blockKey),
      from: source.index,
      to: destination.index,
    })
    const byKey = new Map(blocks.map((block) => [blockKey(block), block]))
    const dragged = shown[source.index]
    // Read from the whole list: a group moves the members a search hid.
    const whole = byKey.get(blockKey(dragged))

    return {
      order: toColumnOrder(keys.flatMap((key) => byKey.get(key) ?? [])),
      moved: {
        columns: toColumnOrder(whole == null ? [] : [whole]),
        groups: dragged.kind === 'group' ? [dragged.name] : [],
      },
    }
  }

  const group = source.droppableId.slice(MEMBERS_PREFIX.length)
  const shownMembers = membersOf(shown, group)
  const members = membersOf(blocks, group)
  if (shownMembers === undefined || members === undefined) {
    return null
  }

  const memberOrder = moveBeside({
    all: members.map(columnName),
    shown: shownMembers.map(columnName),
    from: source.index,
    to: destination.index,
  })

  return {
    order: blocks.flatMap((block) =>
      block.kind === 'group' && block.name === group
        ? memberOrder
        : toColumnOrder([block])
    ),
    moved: { columns: [shownMembers[source.index].name], groups: [] },
  }
}
