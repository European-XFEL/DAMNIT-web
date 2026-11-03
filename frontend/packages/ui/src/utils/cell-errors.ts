export type CellError = {
  message: string
  cls: string
}

export type ErrorKind = 'skipped' | 'missing' | 'error'

export const errorKind = (cls: string): ErrorKind => {
  if (cls === 'Skip') {
    return 'skipped'
  }
  if (cls === 'SourceNameError') {
    return 'missing'
  }
  return 'error'
}

export const errorText = (error: CellError): string =>
  `${error.cls}\n${error.message}`
