// Split the columns into the pinned ones and the rest. Pinned columns come out
// in the order they are pinned, and only if they are still in the list.
//
// Mirrors TanStack, where pinning is applied before ordering, so a later
// columnOrder governs only the centre and can never unfreeze a pinned column.
export function pinnedFirst<T extends { name: string }>(
  columns: T[],
  pinned: string[]
) {
  const byName = new Map(columns.map((column) => [column.name, column]))
  const start = pinned
    .map((name) => byName.get(name))
    .filter((column) => column != null)

  const pinnedNames = new Set(pinned)
  const centre = columns.filter((column) => !pinnedNames.has(column.name))

  return { start, centre }
}
