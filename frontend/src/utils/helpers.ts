import dayjs from "dayjs"

export function formatDate(timestamp) {
  const formattedDate = dayjs(timestamp).format("DD MMMM YYYY")
  const formattedTime = dayjs(timestamp).format("HH:mm:ss")

  return `${formattedTime} | ${formattedDate}`
}

export const formatRunsSubtitle = (runs) => {
  if (!runs || !runs.length) {
    return ""
  }

  return `(run ${runs[0]}${runs.length > 1 ? `-${runs[runs.length - 1]}` : ""})`
}

export function formatFloat(number, { offset = 2 } = {}) {
  const decimal = -1 * Math.floor(Math.log10(Math.abs(number)))
  return number.toFixed(decimal >= 0 ? decimal + offset : 1)
}

export function isEmpty(value) {
  return value == null || size(value) === 0
}

export function size(item) {
  return item.constructor === Object ? Object.keys(item).length : item.length
}

export function createMap(array, by) {
  const map = new Map()
  array.forEach((obj) => {
    map.set(obj[by], obj)
  })
  return map
}
