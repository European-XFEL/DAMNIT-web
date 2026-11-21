import type { HZDRContextResults, HZDRShot } from '../types'

import { getShotFilterValues } from './filter'
import { getShotRowKey } from './shot-key'

type ContextRow = HZDRContextResults['rows'][number]

/**
 * One CSV field. Text that a spreadsheet would run as a formula (starting
 * with =, +, -, @, tab or carriage return) gets a leading apostrophe; numbers
 * stay numbers. Arrays, images and objects are left empty: a CSV holds the
 * values the table shows as text.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text: string
  if (typeof value === 'number') {
    text = Number.isFinite(value) ? String(value) : ''
  } else if (typeof value === 'boolean') {
    text = value ? 'true' : 'false'
  } else if (typeof value === 'string') {
    text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  } else {
    return ''
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The shots as the table shows them: these rows in this order, the visible
 * columns in their order, with `shot_key` first so files can be joined.
 */
export function shotTableCsv(
  shots: HZDRShot[],
  columns: Array<{ value: string; label: string }>,
  contextRowsByShot: Map<string, ContextRow>,
  shotDayLabels: Map<string, string | undefined>
): string {
  const header = ['shot_key', ...columns.map((column) => column.label)]
  const lines = [header.map(csvField).join(',')]
  for (const shot of shots) {
    const rowKey = getShotRowKey(shot)
    const cells = columns.map(
      (column) =>
        getShotFilterValues(
          shot,
          column.value,
          contextRowsByShot.get(rowKey),
          shotDayLabels.get(rowKey)
        )[0]
    )
    lines.push([shot.shot_key ?? '', ...cells].map(csvField).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/** Offer `text` to the browser as a file to save. */
export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
