import type {
  HZDRShot,
  HZDRFilterOperator,
  HZDRSortState,
  HZDRContextResults,
} from '../types'
import { formatFiredAt } from './format'
import { formatTargetLabel } from './metadata'
import { getShotDateKey, getShotRowKey } from './shot-key'

export { getShotDateKey, getShotRowKey } from './shot-key'

type ContextRow = HZDRContextResults['rows'][number]

export function shotMatchesTableFilter(
  shot: HZDRShot,
  filterColumn: string,
  filterOperator: HZDRFilterOperator,
  filterValue: string,
  contextRow?: HZDRContextResults['rows'][number],
  shotDayLabel?: string
) {
  const trimmedFilter = filterValue.trim()
  if (!trimmedFilter) {
    return true
  }
  return getShotFilterValues(shot, filterColumn, contextRow, shotDayLabel).some(
    (value) => valueMatchesTableFilter(value, filterOperator, trimmedFilter)
  )
}

export function compareHZDRShotsForTableSort(
  leftShot: HZDRShot,
  rightShot: HZDRShot,
  sortState: HZDRSortState,
  contextRowsByShot: Map<string, ContextRow>,
  shotDayLabels: Map<string, string | undefined>
) {
  const leftValue = getPrimaryShotSortValue(
    leftShot,
    sortState.column,
    contextRowsByShot.get(getShotRowKey(leftShot)),
    shotDayLabels.get(getShotRowKey(leftShot))
  )
  const rightValue = getPrimaryShotSortValue(
    rightShot,
    sortState.column,
    contextRowsByShot.get(getShotRowKey(rightShot)),
    shotDayLabels.get(getShotRowKey(rightShot))
  )
  const comparison = compareTableValues(leftValue, rightValue)
  if (comparison === 0) {
    return leftShot.shot_number - rightShot.shot_number
  }
  return sortState.direction === 'asc' ? comparison : -comparison
}

export function getShotFilterValues(
  shot: HZDRShot,
  filterColumn: string,
  contextRow?: HZDRContextResults['rows'][number],
  shotDayLabel?: string
) {
  if (filterColumn.startsWith('context:')) {
    const columnName = filterColumn.slice('context:'.length)
    return [contextRow?.values[columnName]]
  }
  const metadataValues: Record<string, unknown> = {
    shot_number: shot.shot_number,
    shot_day: shotDayLabel,
    fired_at: [shot.fired_at, formatFiredAt(shot.fired_at)],
    status: shot.metadata.status,
    laser_energy_j: shot.metadata.laser?.pulse_energy,
    target: formatTargetLabel(shot.metadata.target),
  }
  if (filterColumn !== 'all') {
    return [metadataValues[filterColumn]].flat()
  }
  return [
    ...Object.values(metadataValues).flat(),
    shot.hdf5_path,
    ...Object.values(contextRow?.values ?? {}),
  ]
}

export function valueMatchesTableFilter(
  value: unknown,
  filterOperator: HZDRFilterOperator,
  filterValue: string
) {
  if (value === null || value === undefined) {
    return false
  }
  if (filterOperator === 'includes') {
    return String(value).toLowerCase().includes(filterValue.toLowerCase())
  }
  const numericValue = Number(value)
  const numericFilter = Number(filterValue)
  const canCompareNumbers =
    Number.isFinite(numericValue) && Number.isFinite(numericFilter)
  if (filterOperator === 'equals') {
    return canCompareNumbers
      ? numericValue === numericFilter
      : String(value).toLowerCase() === filterValue.toLowerCase()
  }
  if (!canCompareNumbers) {
    return false
  }
  if (filterOperator === 'gt') {
    return numericValue > numericFilter
  }
  if (filterOperator === 'gte') {
    return numericValue >= numericFilter
  }
  if (filterOperator === 'lt') {
    return numericValue < numericFilter
  }
  return numericValue <= numericFilter
}

/**
 * Each shot's Context Builder row, keyed by getShotRowKey. A row carrying a
 * shot_key only matches that shot; a row from an older API (no shot_key)
 * falls back to its shot_number.
 */
export function buildContextRowsByShot(
  shots: HZDRShot[],
  rows: ContextRow[] = []
) {
  const rowsByKey = new Map<string, ContextRow>()
  const rowsByNumber = new Map<number, ContextRow>()
  for (const row of rows) {
    if (row.shot_key) {
      rowsByKey.set(row.shot_key, row)
    } else if (!rowsByNumber.has(row.shot_number)) {
      rowsByNumber.set(row.shot_number, row)
    }
  }
  const rowsByShot = new Map<string, ContextRow>()
  for (const shot of shots) {
    const row =
      (shot.shot_key ? rowsByKey.get(shot.shot_key) : undefined) ??
      rowsByNumber.get(shot.shot_number)
    if (row) {
      rowsByShot.set(getShotRowKey(shot), row)
    }
  }
  return rowsByShot
}

export function buildShotDayLabels(shots: HZDRShot[]) {
  const dateKeys = Array.from(
    new Set(
      shots
        .map((shot) => getShotDateKey(shot.fired_at))
        .filter((dateKey): dateKey is string => Boolean(dateKey))
    )
  ).sort()
  const dayByDate = new Map(
    dateKeys.map((dateKey, index) => [dateKey, `Day ${index + 1}`])
  )
  return new Map(
    shots.map((shot) => {
      const dateKey = getShotDateKey(shot.fired_at)
      return [
        getShotRowKey(shot),
        dateKey ? (dayByDate.get(dateKey) ?? '-') : '-',
      ]
    })
  )
}

export function getPrimaryShotSortValue(
  shot: HZDRShot,
  sortColumn: string,
  contextRow?: HZDRContextResults['rows'][number],
  shotDayLabel?: string
) {
  return getShotFilterValues(shot, sortColumn, contextRow, shotDayLabel)[0]
}

export function compareTableValues(leftValue: unknown, rightValue: unknown) {
  if (leftValue === undefined || leftValue === null) {
    return rightValue === undefined || rightValue === null ? 0 : 1
  }
  if (rightValue === undefined || rightValue === null) {
    return -1
  }
  const leftNumber = Number(leftValue)
  const rightNumber = Number(rightValue)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber
  }
  const leftDate = Date.parse(String(leftValue))
  const rightDate = Date.parse(String(rightValue))
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
    return leftDate - rightDate
  }
  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function isScalarContextValue(value: unknown, preview: unknown) {
  return (
    typeof value === 'number' && Number.isFinite(value) && preview === undefined
  )
}
