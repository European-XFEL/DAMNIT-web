/**
 * `sortBy` and `orderBy` using vanila JavaScript.
 * @see {@link https://github.com/you-dont-need/You-Dont-Need-Lodash-Underscore/issues/280#issuecomment-1429486744}
 */

export function sortBy<T, K extends keyof T>(
  key: K,
  cb?: (a: T, b: T) => number
): (a: T, b: T) => number {
  return (a: T, b: T): number => {
    const aVal = a[key],
      bVal = b[key]

    if (aVal > bVal) return 1
    if (aVal < bVal) return -1
    return cb ? cb(a, b) : 0
  }
}

export function sortByDesc<T, K extends keyof T>(
  key: K,
  cb?: (a: T, b: T) => number
): (a: T, b: T) => number {
  return (a: T, b: T): number => {
    const aVal = a[key],
      bVal = b[key]

    if (aVal > bVal) return -1
    if (aVal < bVal) return 1
    return cb ? cb(a, b) : 0
  }
}

export function orderBy<T>(
  keys: (keyof T)[],
  orders: ('asc' | 'desc')[]
): (a: T, b: T) => number {
  let cb: (a: T, b: T) => number = () => 0

  const reversedKeys = [...keys].reverse()
  const reversedOrders = [...orders].reverse()

  for (const [i, key] of reversedKeys.entries()) {
    const order = reversedOrders[i]
    if (order === 'asc') {
      cb = sortBy<T, typeof key>(key, cb)
    } else if (order === 'desc') {
      cb = sortByDesc<T, typeof key>(key, cb)
    }
  }

  return cb
}
