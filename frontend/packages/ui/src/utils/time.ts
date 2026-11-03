export const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const clockTime = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium' })

type FormatTimeAgoOptions = { now: number }

// "just now", "3 minutes ago" and "5 hours ago" under a day, then "yesterday"
// and "5 days ago" by the calendar up to a week, then "29 April 2026". Times
// are in milliseconds.
export function formatTimeAgo(time: number, { now }: FormatTimeAgoOptions) {
  const age = now - time
  if (age < MINUTE) {
    return 'just now'
  }
  if (age < HOUR) {
    return relativeTime.format(-Math.floor(age / MINUTE), 'minute')
  }

  // Local midnights, rounded, so a 23 or 25 hour day around DST counts as one.
  // A 25 hour day can hold a time over a day old, which stays in hours.
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY)
  if (age < DAY || days === 0) {
    return relativeTime.format(-Math.floor(age / HOUR), 'hour')
  }
  if (days < 7) {
    return relativeTime.format(-days, 'day')
  }
  return formatLongDate(time)
}

function startOfDay(time: number) {
  return new Date(time).setHours(0, 0, 0, 0)
}

// "29 April 2026"
export function formatLongDate(time: number) {
  return longDate.format(time)
}

// "14:02:31"
export function formatClockTime(time: number) {
  return clockTime.format(time)
}
