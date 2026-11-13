import { expect, test } from 'vitest'

import {
  formatRunSelection,
  parseRunSelection,
  plotName,
  plotRunIds,
} from '#src/features/plots/utils'

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

test('a run selection refuses more runs in total than one range may span', () => {
  expect(parseRunSelection('1-9000,20001-29000')).toEqual({
    error: 'The selection holds more than 10000 runs',
  })
})

test('a run selection refuses a range past the largest safe number', () => {
  // Counting up from 2^53 never moves, so the range would never end.
  expect(parseRunSelection('9007199254740992-9007199254740999')).toEqual({
    error: '"9007199254740992-9007199254740999" is not a run or a range',
  })
})

test('a run list writes runs in a row as one range', () => {
  const firstTwenty = Array.from({ length: 20 }, (_, index) =>
    String(index + 1)
  )

  expect(formatRunSelection([...firstTwenty, '25', '27', '28'])).toBe(
    '1-20,25,27-28'
  )
})

test('a run list writes a run picked twice once', () => {
  // Two cells picked in one row of the table give that row's run twice.
  expect(formatRunSelection(['5', '5', '6'])).toBe('5-6')
})

test("a summary plot is named y vs. x by the variables' titles", () => {
  const variableMeta = {
    run: { name: 'run', title: 'Run', tags: [] },
    xgm_pulses: { name: 'xgm_pulses', title: 'Pulses', tags: [] },
  }

  expect(
    plotName(
      { source: 'summary', variables: ['run', 'xgm_pulses'] },
      variableMeta
    )
  ).toBe('Pulses vs. Run')
})

test("a preview plot is named by its variable's title", () => {
  const variableMeta = {
    detector_image: {
      name: 'detector_image',
      title: 'Detector image',
      tags: [],
    },
  }

  expect(
    plotName(
      { source: 'preview', variables: ['detector_image'], runs: ['5'] },
      variableMeta
    )
  ).toBe('Detector image')
})

test("a plot's runs leave out a guest proposal's run of the same number", () => {
  const allRuns = [
    { proposal: '6996', run: 1 },
    { proposal: '6996', run: 2 },
    { proposal: '7001', run: 2 },
  ]

  expect(plotRunIds(allRuns, { proposal: '6996', runs: ['2', '3'] })).toEqual([
    { proposal: '6996', run: 2 },
  ])
})
