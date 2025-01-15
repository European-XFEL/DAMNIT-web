export function isArrayEqual(arr1, arr2) {
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

export function sorted(array) {
  return array.slice().sort((a, b) => a - b)
}

export function sortedInsert(array, element, unique = true) {
  let left = 0
  let right = array.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)

    if (array[mid] === element) {
      // If the element is already in the array, insert it after the existing one
      if (!unique) {
        array.splice(mid + 1, 0, element)
      }
      return
    } else if (array[mid] < element) {
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  // If the loop exits, the correct position is found, insert the element
  array.splice(left, 0, element)
}

export function sortedSearch(array, target) {
  let left = 0
  let right = array.length - 1

  while (left <= right) {
    // Calculate the middle index of the current search range
    const mid = Math.floor((left + right) / 2)

    // Check if the middle element is the target
    if (array[mid] === target) {
      return mid
    } else if (array[mid] < target) {
      // If the target is greater, narrow the search to the right half
      left = mid + 1
    } else {
      // If the target is smaller, narrow the search to the left half
      right = mid - 1
    }
  }

  // If the loop exits, the target is not in the array
  return -1
}
