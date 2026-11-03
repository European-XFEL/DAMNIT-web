import type { TableMeta, Variable } from '#src/data/table/table-data.types'
import { buildVariableBlocks } from '#src/data/table/variable-blocks'
import type {
  VariableBlock,
  VariableGroupBlock,
  VariableItem,
} from '#src/utils/variable-blocks'

// One column as the Variables popover lists it: the variable, plus whether the
// table shows it and whether the user may hide it.
export type Column = VariableItem & {
  isVisible: boolean
  // False for a column the table always shows, like the run number.
  canHide: boolean
  passesTagFilter: boolean
  tags: string[]
}

export type ColumnGroupBlock = VariableGroupBlock<Column>

export type ColumnBlock = VariableBlock<Column>

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

export function buildColumnBlocks({
  variables,
  groups,
  visibility,
  tagFilter,
}: BuildColumnBlocksOptions): ColumnBlock[] {
  return buildVariableBlocks(variables, {
    groups,
    toItem: (variable, item) => {
      const canHide = visibility[variable.name] !== undefined
      return {
        ...item,
        isVisible: visibility[variable.name] ?? true,
        canHide,
        // The tags filter only what the user can hide, so they never refuse the rest.
        passesTagFilter:
          !canHide || tagFilter == null || !!tagFilter[variable.name],
        tags: variable.tags,
      }
    },
  })
}
