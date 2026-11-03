import type {
  Column,
  ColumnBlock,
} from '#src/features/table/utils/column-blocks'
import { blockKey, titleMatcher, variableKey } from '#src/utils/variable-blocks'

export type ColumnMatch =
  | { kind: 'group'; key: string }
  | { kind: 'column'; key: string; column: Column }

// A group matches once, by its heading; its members match by their own titles.
export function findColumnMatches(
  blocks: ColumnBlock[],
  query: string
): ColumnMatch[] {
  if (query.trim() === '') {
    return []
  }

  const contains = titleMatcher(query)
  const matchColumn = (column: Column): ColumnMatch[] =>
    contains(column.columnTitle)
      ? [{ kind: 'column', key: variableKey(column.name), column }]
      : []

  return blocks.flatMap((block) => {
    if (block.kind !== 'group') {
      return matchColumn(block)
    }

    const heading: ColumnMatch[] = contains(block.title)
      ? [{ kind: 'group', key: blockKey(block) }]
      : []
    return [...heading, ...block.members.flatMap(matchColumn)]
  })
}
