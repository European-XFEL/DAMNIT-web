import { PINNED_COLUMNS } from '#src/constants'

// How many columns the grid should freeze: the identity columns it is currently
// showing. Counting the leading ones rather than the pinned set keeps this
// right when the proposal column is hidden, which it is by default.
export function countPinnedColumns(columns: { id: string }[]): number {
  const firstLoose = columns.findIndex(({ id }) => !PINNED_COLUMNS.includes(id))

  return firstLoose === -1 ? columns.length : firstLoose
}
