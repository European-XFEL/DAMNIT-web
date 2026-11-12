import dayjs from 'dayjs'
import { sortBy, uniq } from 'lodash-es'

export function formatDate(timestamp: number) {
  const formattedDate = dayjs(timestamp).format('DD MMMM YYYY')
  const formattedTime = dayjs(timestamp).format('HH:mm:ss')

  return `${formattedTime} | ${formattedDate}`
}

// No runs of its own means the plot follows every run, however many arrive.
export function formatRunsSubtitle(runs: string[] | undefined) {
  if (!runs) {
    return 'All runs'
  }

  const numbers = sortBy(uniq(runs.map(Number)))
  if (numbers.length === 0) {
    return ''
  }

  const first = numbers[0]
  const last = numbers[numbers.length - 1]
  if (numbers.length === 1) {
    return `Run ${first}`
  }
  if (last - first === numbers.length - 1) {
    return `Runs ${first}-${last}`
  }
  return `${numbers.length} runs, ${first}-${last}`
}

export function formatNumber(number: number, options = {}): number {
  return Number.isInteger(number) ? number : formatFloat(number, options)
}

function formatFloat(number: number, { offset = 2 } = {}) {
  const decimal = -1 * Math.floor(Math.log10(Math.abs(number)))
  return Number(number.toFixed(decimal >= 0 ? decimal + offset : 1))
}

export function formatUrl(url: string) {
  return (url || '/').replace(/\/?$/, '/')
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}
