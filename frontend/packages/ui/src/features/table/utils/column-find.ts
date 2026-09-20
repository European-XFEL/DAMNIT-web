import type {
  Column,
  ColumnBlock,
} from '#src/features/table/utils/column-blocks'
import { blockKey, variableKey } from '#src/utils/variable-blocks'

// One stop of a find, named by the key the list gives the row. A group stops on
// its heading alone; hiding its members is what the link beside it is for.
export type ColumnMatch =
  | { kind: 'group'; key: string }
  | { kind: 'column'; key: string; column: Column }

// Every stop a search makes, in list order. It matches the text a row draws: a
// group by its heading, once, and each column by its own title.
export function findColumnMatches(
  blocks: ColumnBlock[],
  query: string
): ColumnMatch[] {
  const search = query.trim().toLowerCase()
  if (search === '') {
    return []
  }

  const contains = (text: string) => text.toLowerCase().includes(search)
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
