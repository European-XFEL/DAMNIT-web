export function imageBytesToURL(bytes) {
  return "data:image/png;base64," + bytes;
}

export function formatDate(timestamp) {
  const d = new Date(timestamp);
  const time = d.toLocaleTimeString();
  return time.substr(0, 5) + time.slice(-2) + " | " + d.toLocaleDateString();
}

export function formatFloat(number, {offset=2, default=1} = {}) {
  const decimal = -1 * Math.floor(Math.log10(Math.abs(number)))
  return number.toFixed(decimal >= 0 ? decimal + offset : 1)
}

export function isEmpty(value) {
  return (
    value === undefined ||
    value == null ||
    (Array.isArray(value) && value.length <= 0)
  );
}

export function size(item) {
  return item.constructor === Object ? Object.keys(item).length : item.length
}

export function arrayEqual(arr1, arr2) {
  return (
    arr1.length == arr2.length && arr1.every((x, index) => x == arr2[index])
  );
}
