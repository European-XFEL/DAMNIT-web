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

/** What the UI shows where a value was never recorded. */
export const NOT_RECORDED = 'Not recorded'

/** A shot time for people: local date and time, no seconds, no ISO. */
export function formatShotTime(value: string | null | undefined) {
  if (!value) {
    return NOT_RECORDED
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** An example-shot label: "Shot 7 · 1 Jul, 11:36". */
export function formatShotLabel(
  shotNumber: number | string,
  firedAt?: string | null
) {
  return firedAt
    ? `Shot ${shotNumber} · ${formatShotTime(firedAt)}`
    : `Shot ${shotNumber}`
}

const MATCH_QUALITY_LABELS: Record<string, string> = {
  exact_kafka_event_id: 'Matched by its Kafka event id',
  exact_transport_position: 'Matched by its broker position',
  event_identity: 'Built from its own events',
  exact_day_shot_number: 'Matched by shot number, same day',
  shot_number: 'Matched by shot number',
  exact_day_shot_number_time_window: 'Shot number and time, same day',
  shot_number_time_window: 'Shot number and time',
  nearest_time: 'Nearest in time',
  labfrog_only: 'LabFrog record only, no events',
  unmatched: 'Not matched',
  ambiguous: 'Ambiguous: waiting in Review matches',
}

/** A match quality in words (hzdr_nexus.MATCH_RANK keys). */
export function matchQualityLabel(quality: string | null | undefined) {
  if (!quality) {
    return NOT_RECORDED
  }
  return MATCH_QUALITY_LABELS[quality] ?? quality.replace(/_/g, ' ')
}

/**
 * A campaign's name as people know it: the catalog title without the
 * builder's "HZDR canonical campaign (...)" wrapper.
 */
export function campaignTitle(title: string | null | undefined) {
  if (!title) {
    return ''
  }
  const wrapped = /^HZDR canonical campaign \((.*)\)$/.exec(title.trim())
  return wrapped ? wrapped[1] : title
}
