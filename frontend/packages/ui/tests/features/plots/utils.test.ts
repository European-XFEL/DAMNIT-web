import { expect, test } from 'vitest'

import { parseRunSelection } from '#src/features/plots/utils'

test('a run selection expands a range into every run it covers', () => {
  expect(parseRunSelection('6-9')).toEqual(['6', '7', '8', '9'])
})

test('a run selection expands a range whose ends differ in length', () => {
  // Sorting the ends as strings put "20" below "6", so the range counted down
  // and the dialog plotted nothing. This is the example its own placeholder
  // offers, so it has to work.
  expect(parseRunSelection('6-20')).toHaveLength(15)
  expect(parseRunSelection('6-20')[0]).toBe('6')
  expect(parseRunSelection('6-20').at(-1)).toBe('20')
})

test('a run selection reads a range given back to front', () => {
  expect(parseRunSelection('9-6')).toEqual(['6', '7', '8', '9'])
})

test('a run selection keeps single runs discrete', () => {
  // 7,9 asks for two runs, not the range between them.
  expect(parseRunSelection('7,9')).toEqual(['7', '9'])
})

test('a run selection mixes single runs and ranges', () => {
  expect(parseRunSelection('1,2,3,6-8,22')).toEqual([
    '1',
    '2',
    '3',
    '6',
    '7',
    '8',
    '22',
  ])
})
