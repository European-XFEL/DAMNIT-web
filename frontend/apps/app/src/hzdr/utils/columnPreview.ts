import { useEffect, useState } from 'react'

import type { HZDRDatasetPreview, HZDRShot, HZDRTrendValue } from '../types'

import { getNestedMetadataValue } from './metadata'
import { toTrendValue } from './shot-key'

/**
 * A recorded value as a number, the way a suggested column reads it: numbers
 * as they are, text with a decimal point or a decimal comma ("99,4", as typed
 * in LabFrog). Booleans and empty values are not numbers.
 */
export function parseRecordedNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const number = Number(value.trim().replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

/** A number as a preview cell shows it: four significant digits, no
 * trailing zeros ("1.5", not "1.500"); very large or small in e-notation. */
export function formatPreviewNumber(value: number) {
  const size = Math.abs(value)
  if (size >= 1e5 || (size > 0 && size < 1e-3)) return value.toExponential(2)
  return String(Number(value.toPrecision(4)))
}

/** What one shot's column cell would hold for a metadata field. */
export type CellValue =
  | { state: 'missing' }
  | { state: 'number'; value: number }
  | { state: 'text'; value: string }
  | { state: 'not-a-number'; value: string }

export function cellValue(
  shot: HZDRShot | undefined,
  field: string,
  type: 'number' | 'text'
): CellValue {
  const raw = shot ? getNestedMetadataValue(shot.metadata, field) : undefined
  if (raw === null || raw === undefined || raw === '') {
    return { state: 'missing' }
  }
  if (type === 'text') return { state: 'text', value: String(raw) }
  const number = parseRecordedNumber(raw)
  return number === null
    ? { state: 'not-a-number', value: String(raw) }
    : { state: 'number', value: number }
}

/** A field's values across the campaign, for the "Across the campaign" view. */
export function campaignValues(shots: HZDRShot[], field: string) {
  const numbers: HZDRTrendValue[] = []
  const labels = new Map<string, number>()
  let recorded = 0
  for (const shot of shots) {
    const raw = getNestedMetadataValue(shot.metadata, field)
    if (raw === null || raw === undefined || raw === '') continue
    recorded += 1
    const text = String(raw)
    labels.set(text, (labels.get(text) ?? 0) + 1)
    const number = parseRecordedNumber(raw)
    if (number !== null) numbers.push(toTrendValue(shot, number))
  }
  return {
    numbers,
    labels: [...labels.entries()].sort((a, b) => b[1] - a[1]),
    recorded,
    total: shots.length,
    /** Most recorded values parse as numbers: show a trend, not labels. */
    numeric: recorded > 0 && numbers.length >= 0.9 * recorded,
  }
}

export function datasetPreviewUrl(
  sourceKey: string,
  shot: HZDRShot,
  datasetName: string
) {
  const query = shot.shot_key
    ? `?${new URLSearchParams({ shot_key: shot.shot_key })}`
    : ''
  return `/metadata/hzdr/sources/${sourceKey}/shots/${shot.shot_number}/datasets/${datasetName}${query}`
}

/** A dataset preview as the API sends it; anything else is an error. */
export function isDatasetPreview(value: unknown): value is HZDRDatasetPreview {
  if (!value || typeof value !== 'object') return false
  const preview = value as Partial<HZDRDatasetPreview>
  return (
    typeof preview.name === 'string' &&
    Array.isArray(preview.shape) &&
    ['image', 'line', 'scalar'].includes(String(preview.preview_kind))
  )
}

/**
 * The example shot's preview of one HDF5 dataset, fetched whenever the shot
 * or the dataset changes (nothing is fetched while `datasetName` is empty).
 */
/** Previews already read, newest last: reopening a card or switching mode
 * shows them at once instead of reading the dataset again. Only successful
 * reads are kept, and only the most recent few. */
const PREVIEW_CACHE_SIZE = 32
const previewCache = new Map<string, HZDRDatasetPreview>()

function rememberPreview(url: string, preview: HZDRDatasetPreview) {
  previewCache.delete(url)
  previewCache.set(url, preview)
  while (previewCache.size > PREVIEW_CACHE_SIZE) {
    const oldest = previewCache.keys().next().value
    if (oldest === undefined) break
    previewCache.delete(oldest)
  }
}

/** For tests: start from an empty cache. */
export function clearDatasetPreviewCache() {
  previewCache.clear()
}

export function useDatasetPreview(
  sourceKey: string | undefined,
  shot: HZDRShot | undefined,
  datasetName: string | undefined
) {
  const url =
    sourceKey && shot && datasetName
      ? datasetPreviewUrl(sourceKey, shot, datasetName)
      : undefined
  const [state, setState] = useState<{
    url?: string
    preview?: HZDRDatasetPreview
    error?: string
  }>({})

  const cached = url ? previewCache.get(url) : undefined

  useEffect(() => {
    if (!url || previewCache.has(url)) return
    let active = true
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<HZDRDatasetPreview>
      })
      .then((preview) => {
        if (!isDatasetPreview(preview)) throw new Error('Not a preview')
        rememberPreview(url, preview)
        if (active) setState({ url, preview })
      })
      .catch(() => {
        if (active)
          setState({
            url,
            error: 'Could not read this dataset on the example shot.',
          })
      })
    return () => {
      active = false
    }
  }, [url])

  const current = cached
    ? { preview: cached, error: undefined }
    : state.url === url
      ? state
      : {}
  return {
    preview: current.preview,
    error: current.error,
    loading: Boolean(url) && !current.preview && !current.error,
  }
}
