export function isNumericLinePreview(preview: unknown): preview is number[] {
  return (
    Array.isArray(preview) &&
    preview.length > 1 &&
    preview.every(
      (entry) => typeof entry === 'number' && Number.isFinite(entry)
    )
  )
}

export function isNumericMatrixPreview(
  preview: unknown
): preview is number[][] {
  return (
    Array.isArray(preview) &&
    preview.length > 0 &&
    preview.every(
      (row) =>
        Array.isArray(row) &&
        row.length > 0 &&
        row.every(
          (entry) => typeof entry === 'number' && Number.isFinite(entry)
        )
    )
  )
}
