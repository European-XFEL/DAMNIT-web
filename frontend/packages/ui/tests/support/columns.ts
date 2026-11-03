import type { TableMeta, Variable } from '#src/data/table/table-data.types'
import { buildColumnBlocks } from '#src/features/table/utils/column-blocks'

// Shaped like the xpcs example: two ungrouped columns around a three-member
// group, in the order the server sends them.
export const VARIABLES: Variable[] = [
  { name: 'n_trains', title: 'Trains', tags: [] },
  { name: 'sample.type', title: 'Sample/Type', tags: [], group: 'sample' },
  { name: 'sample.x', title: 'Sample/X [mm]', tags: [], group: 'sample' },
  { name: 'sample.y', title: 'Sample/Y [mm]', tags: [], group: 'sample' },
  { name: 'scan_type', title: 'Scan type', tags: [] },
]

export const GROUPS: TableMeta['groups'] = {
  sample: { name: 'sample', title: 'Sample' },
}

export const ALL_VISIBLE = Object.fromEntries(
  VARIABLES.map((variable) => [variable.name, true])
)

// The example walked into blocks, which is what a list of columns looks like
// everywhere but the builder's own tests.
export const exampleBlocks = ({ visibility = ALL_VISIBLE } = {}) =>
  buildColumnBlocks({
    variables: VARIABLES,
    groups: GROUPS,
    visibility,
    tagFilter: null,
  })
