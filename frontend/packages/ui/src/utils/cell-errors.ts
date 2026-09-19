export type CellError = {
  message: string
  cls: string
}

export type ErrorKind = 'skipped' | 'missing' | 'error'

const ERROR_TITLES: Record<ErrorKind, string> = {
  skipped: 'Missing dependency',
  missing: 'Missing data',
  error: 'Error',
}

// Resolve an exception class to its display kind.
export const errorKind = (cls: string): ErrorKind =>
  cls === 'Skip' ? 'skipped' : cls === 'SourceNameError' ? 'missing' : 'error'

// Resolve an exception class to its display kind and title.
export const errorVisuals = (cls: string) => {
  const kind = errorKind(cls)
  return { kind, title: ERROR_TITLES[kind] }
}

// The text a copy puts on the clipboard, for the grid cell and the error card.
export const errorText = (error: CellError): string =>
  `${error.cls}\n${error.message}`
