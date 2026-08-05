export function isArrayEqual<T>(
  arr1: ReadonlyArray<T> | null | undefined,
  arr2: ReadonlyArray<T> | null | undefined
) {
  if (arr1 == null && arr2 == null) {
    return true
  }

  if (arr1 == null || arr2 == null) {
    return false
  }

  if (arr1.length !== arr2.length) {
    return false
  }

  return arr1.every((elem, index) => elem === arr2[index])
}

export function sorted<T>(array: T[]) {
  return array.slice().sort((a, b) => Number(a) - Number(b))
}
