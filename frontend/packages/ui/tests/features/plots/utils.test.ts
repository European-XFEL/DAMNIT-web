import { expect, test } from 'vitest'

import { parseRunSelection } from '#src/features/plots/utils'

test('a run selection expands a range into every run it covers', () => {
  expect(parseRunSelection('6-9')).toEqual({ runs: ['6', '7', '8', '9'] })
})

test('a run selection expands a range whose ends differ in length', () => {
  // Sorting the ends as strings put "20" below "6", so the range counted down
  // and the dialog plotted nothing.
  const selection = parseRunSelection('6-20')

  expect(selection).toEqual({
    runs: Array.from({ length: 15 }, (_, index) => String(index + 6)),
  })
})

test('a run selection reads a range given back to front', () => {
  expect(parseRunSelection('9-6')).toEqual({ runs: ['6', '7', '8', '9'] })
})

test('a run selection reads a range with spaces around its dash', () => {
  expect(parseRunSelection('6 - 9, 11 -12')).toEqual({
    runs: ['6', '7', '8', '9', '11', '12'],
  })
})

test('a run selection keeps single runs discrete', () => {
  // 7,9 asks for two runs, not the range between them.
  expect(parseRunSelection('7,9')).toEqual({ runs: ['7', '9'] })
})

test('a run selection mixes single runs and ranges', () => {
  expect(parseRunSelection('1,2,3,6-8,22')).toEqual({
    runs: ['1', '2', '3', '6', '7', '8', '22'],
  })
})

test('a run selection lists each run once, in numeric order', () => {
  expect(parseRunSelection('9, 7, 6-8')).toEqual({ runs: ['6', '7', '8', '9'] })
})

test('a run selection refuses the first entry that is not a run or a range', () => {
  expect(parseRunSelection('7,abc,1-x')).toEqual({
    error: '"abc" is not a run or a range',
  })
})

test('a run selection with no runs in it asks for one', () => {
  expect(parseRunSelection(' , ')).toEqual({ error: 'Enter at least one run' })
})

test('a run selection takes a range of up to 10000 runs', () => {
  expect(parseRunSelection('1-10000')).toEqual({
    runs: Array.from({ length: 10000 }, (_, index) => String(index + 1)),
  })
})

test('a run selection refuses a range wider than 10000 runs', () => {
  // One zero too many, which would otherwise freeze the tab.
  expect(parseRunSelection('100-1000000')).toEqual({
    error: '"100-1000000" spans more than 10000 runs',
  })
})

test('a run selection refuses a range past the largest safe number', () => {
  // Counting up from 2^53 never moves, so the range would never end.
  expect(parseRunSelection('9007199254740992-9007199254740999')).toEqual({
    error: '"9007199254740992-9007199254740999" is not a run or a range',
  })
})
