export function imageBytesToURL(bytes) {
  return "data:image/png;base64," + bytes;
}

export function isEmpty(value) {
  return (
    value === undefined ||
    value == null ||
    (Array.isArray(Array) && value.length <= 0)
  );
}
