import dayjs from "dayjs"


export function imageBytesToURL(bytes) {
  return "data:image/png;base64," + bytes;
}

export function formatDate(timestamp) {
  const formattedDate = dayjs(timestamp).format('DD MMMM YYYY');
  const formattedTime = dayjs(timestamp).format('HH:mm:ss');

  return `${formattedTime} | ${formattedDate}`
}

export function formatFloat(number, {offset=2, default=1} = {}) {
  const decimal = -1 * Math.floor(Math.log10(Math.abs(number)))
  return number.toFixed(decimal >= 0 ? decimal + offset : 1)
}

export function isEmpty(value) {
  return (
    value === undefined ||
    value == null ||
    size(value) === 0
  );
}

export function size(item) {
  return item.constructor === Object ? Object.keys(item).length : item.length
}

export function createMap(array, by) {
  const map = new Map()
  array.forEach(obj => {map.set(obj[by], obj)})
  return map
}