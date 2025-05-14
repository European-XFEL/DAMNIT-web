import dayjs from 'dayjs'

export function formatDate(timestamp: number) {
  const formattedDate = dayjs(timestamp).format('DD MMMM YYYY')
  const formattedTime = dayjs(timestamp).format('HH:mm:ss')

  return `${formattedTime} | ${formattedDate}`
}

export const formatRunsSubtitle = (runs: string[]) => {
  if (!runs || !runs.length) {
    return ''
  }

  return `(run ${runs[0]}${runs.length > 1 ? `-${runs[runs.length - 1]}` : ''})`
}

export function formatNumber(number: number, options = {}): number {
  return Number.isInteger(number) ? number : formatFloat(number, options)
}

function formatFloat(number: number, { offset = 2 } = {}) {
  const decimal = -1 * Math.floor(Math.log10(Math.abs(number)))
  return Number(number.toFixed(decimal >= 0 ? decimal + offset : 1))
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
