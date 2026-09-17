import dayjs from 'dayjs'

import { sorted } from './array'

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

  const numbers = sorted([...new Set(runs.map(Number))])
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

type MaybeObjectOrArray<T> =
  | Record<string, unknown>
  | ReadonlyArray<T>
  | null
  | undefined

export function isEmpty<T>(value: MaybeObjectOrArray<T>) {
  return value == null || size(value) === 0
}

export function size<T>(value: MaybeObjectOrArray<T>) {
  if (value == null) {
    return 0
  }
  if (Array.isArray(value)) {
    return value.length
  }
  return Object.keys(value).length
}

export function createMap<T>(array: T[], by: keyof T): Map<T[keyof T], T> {
  const map = new Map<T[keyof T], T>()
  array.forEach((obj) => {
    map.set(obj[by], obj)
  })
  return map
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}
