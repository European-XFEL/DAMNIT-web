export function imageBytesToURL(bytes) {
  return "data:image/png;base64," + bytes;
}

export function isEmpty(value) {
  return (
    value === undefined ||
    value == null ||
    (Array.isArray(value) && value.length <= 0)
  );
}

export function arrayEqual(arr1, arr2) {
  return (
    arr1.length == arr2.length && arr1.every((x, index) => x == arr2[index])
  );
}
