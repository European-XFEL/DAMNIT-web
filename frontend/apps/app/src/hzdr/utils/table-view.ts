import type { HZDRFilterOperator, HZDRSortState } from '../types'

export type ShotTableColumnSpec = {
  value: string
  label: string
  width: number
}

/**
 * The six fixed shot-table columns. This single spec drives the filter-column
 * options, the visibility checkbox group, the sortable headers, the cell
 * widths, and the table minimum width in ShotPage. Context columns are
 * appended dynamically with CONTEXT_COLUMN_WIDTH.
 */
export const SHOT_TABLE_COLUMNS: ShotTableColumnSpec[] = [
  { value: 'shot_number', label: 'Shot', width: 86 },
  { value: 'shot_day', label: 'Day', width: 92 },
  { value: 'fired_at', label: 'Fired at', width: 168 },
  { value: 'status', label: 'Status', width: 112 },
  { value: 'laser_energy_j', label: 'Energy', width: 96 },
  { value: 'target', label: 'Target', width: 146 },
]

export const CONTEXT_COLUMN_WIDTH = 180

export const SHOT_TABLE_COLUMN_WIDTHS: Record<string, number> =
  Object.fromEntries(
    SHOT_TABLE_COLUMNS.map((column) => [column.value, column.width])
  )

export type ShotTableView = {
  filterColumn: string
  filterOperator: HZDRFilterOperator
  filterValue: string
  sortState: HZDRSortState
  hiddenTableColumns: string[]
}

const FILTER_OPERATORS: readonly HZDRFilterOperator[] = [
  'includes',
  'equals',
  'gt',
  'gte',
  'lt',
  'lte',
]

const shotTableViewStorageKey = (sourceKey: string) =>
  `hzdr:shot-table-view:${sourceKey}`

const isFilterOperator = (value: unknown): value is HZDRFilterOperator =>
  FILTER_OPERATORS.includes(value as HZDRFilterOperator)

const isSortDirection = (value: unknown): value is 'asc' | 'desc' =>
  value === 'asc' || value === 'desc'

/**
 * Load the persisted per-source view (filter, sort, hidden columns) from
 * localStorage. Returns undefined for missing keys, malformed JSON, or any
 * payload that does not match the expected shape.
 */
export function loadShotTableView(
  sourceKey: string
): ShotTableView | undefined {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(shotTableViewStorageKey(sourceKey))
  } catch {
    return undefined
  }
  if (!raw) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined
  }
  const candidate = parsed as Record<string, unknown>
  const sortState = candidate.sortState as Record<string, unknown> | undefined
  if (
    typeof candidate.filterColumn !== 'string' ||
    !isFilterOperator(candidate.filterOperator) ||
    typeof candidate.filterValue !== 'string' ||
    typeof sortState !== 'object' ||
    sortState === null ||
    typeof sortState.column !== 'string' ||
    !isSortDirection(sortState.direction) ||
    !Array.isArray(candidate.hiddenTableColumns) ||
    !candidate.hiddenTableColumns.every((entry) => typeof entry === 'string')
  ) {
    return undefined
  }
  return {
    filterColumn: candidate.filterColumn,
    filterOperator: candidate.filterOperator,
    filterValue: candidate.filterValue,
    sortState: { column: sortState.column, direction: sortState.direction },
    hiddenTableColumns: candidate.hiddenTableColumns as string[],
  }
}

/** Persist the per-source view to localStorage (best-effort). */
export function saveShotTableView(
  sourceKey: string,
  view: ShotTableView
): void {
  try {
    window.localStorage.setItem(
      shotTableViewStorageKey(sourceKey),
      JSON.stringify(view)
    )
  } catch {
    // Storage may be unavailable (private mode, quota); persistence is
    // best-effort and the in-memory state remains authoritative.
  }
}
