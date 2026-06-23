export function formatFiredAt(firedAt: string) {
  if (!firedAt) {
    return '-'
  }
  const date = new Date(firedAt)
  if (Number.isNaN(date.getTime())) {
    return firedAt
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function formatContextValue(value: unknown) {
  if (value === null || value === undefined) {
    return '-'
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toPrecision(5)
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

export function formatSelectedInput(value: string) {
  if (value.startsWith('metadata:')) {
    return `metadata.${value.slice(9)}`
  }
  if (value.startsWith('hdf5:')) {
    return `hdf5[${value.slice(5)}]`
  }
  if (value.startsWith('mongo:')) {
    return `mongo.${value.slice(6)}`
  }
  return value
}

export function isMissingContextValueError(error: string) {
  const normalized = error.toLowerCase()
  return (
    normalized.startsWith('no ') ||
    normalized.includes('missing ') ||
    normalized.includes('not found')
  )
}

export function formatTrendValue(value: number) {
  if (
    Math.abs(value) >= 1000 ||
    (Math.abs(value) > 0 && Math.abs(value) < 0.001)
  ) {
    return value.toExponential(2)
  }
  return Number.isInteger(value) ? value.toString() : value.toPrecision(4)
}

export function statusColor(status: string) {
  if (status === 'processed') {
    return 'teal'
  }
  if (status === 'needs-review') {
    return 'yellow'
  }
  if (status === 'revision-needed') {
    return 'red'
  }
  return 'gray'
}

export function statusLabel(status: string) {
  if (status === 'processed') {
    return 'Processed'
  }
  if (status === 'needs-review') {
    return 'Needs review'
  }
  if (status === 'revision-needed') {
    return 'Needs revision'
  }
  return status || 'Unknown'
}

export function defaultReviewNote(status: string) {
  if (status === 'processed') {
    return 'Reviewed and accepted'
  }
  if (status === 'revision-needed') {
    return 'Processed data needs revision'
  }
  return 'Needs manual review'
}
