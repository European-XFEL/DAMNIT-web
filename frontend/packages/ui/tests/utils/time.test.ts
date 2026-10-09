import { expect, onTestFinished, test, vi } from 'vitest'

import { formatTimeAgo } from '#src/utils/time'

const now = Date.UTC(2026, 9, 7, 14, 0, 0)
const seconds = (count: number) => count * 1000
const minutes = (count: number) => seconds(count * 60)
const hours = (count: number) => minutes(count * 60)
const days = (count: number) => hours(count * 24)

const agoBy = (age: number) => formatTimeAgo(now - age, { now })

// Days count on the calendar, so these build local times in October 2026.
const at = ({ day, hour }: { day: number; hour: number }) =>
  new Date(2026, 9, day, hour).getTime()

test('a time under a minute old reads as just now', () => {
  expect(agoBy(0)).toBe('just now')
  expect(agoBy(seconds(59))).toBe('just now')
})

test('a time from a clock ahead of this one reads as just now', () => {
  expect(agoBy(-seconds(30))).toBe('just now')
})

test('a time under an hour old reads in whole minutes', () => {
  expect(agoBy(minutes(1))).toBe('1 minute ago')
  expect(agoBy(minutes(3) + seconds(59))).toBe('3 minutes ago')
  expect(agoBy(minutes(59))).toBe('59 minutes ago')
})

test('a time under a day old reads in whole hours', () => {
  expect(agoBy(hours(1))).toBe('1 hour ago')
  expect(agoBy(hours(23) + minutes(59))).toBe('23 hours ago')
})

// Berlin's clocks go back an hour on 25 October 2026, so that day has 25 hours.
test('a time a day old on the day clocks go back reads in hours', () => {
  vi.stubEnv('TZ', 'Europe/Berlin')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })

  expect(
    formatTimeAgo(at({ day: 25, hour: 0 }), { now: at({ day: 25, hour: 23 }) })
  ).toBe('24 hours ago')
})

test('a time a day or more old from the day before reads as yesterday', () => {
  expect(
    formatTimeAgo(at({ day: 6, hour: 22 }), { now: at({ day: 7, hour: 23 }) })
  ).toBe('yesterday')
  expect(
    formatTimeAgo(at({ day: 6, hour: 0 }), { now: at({ day: 7, hour: 23 }) })
  ).toBe('yesterday')
})

test('a time a day or more old counts calendar days, not 24 hour blocks', () => {
  expect(
    formatTimeAgo(at({ day: 5, hour: 23 }), { now: at({ day: 7, hour: 1 }) })
  ).toBe('2 days ago')
})

test('a time under a week of calendar days old reads in whole days', () => {
  expect(
    formatTimeAgo(at({ day: 5, hour: 14 }), { now: at({ day: 7, hour: 14 }) })
  ).toBe('2 days ago')
  expect(
    formatTimeAgo(at({ day: 1, hour: 0 }), { now: at({ day: 7, hour: 23 }) })
  ).toBe('6 days ago')
})

test('a time a week old or more reads as its date', () => {
  expect(agoBy(days(7))).toBe('30 September 2026')
  expect(formatTimeAgo(Date.UTC(2026, 3, 29, 9, 30), { now })).toBe(
    '29 April 2026'
  )
})
