import { expect, test } from 'vitest'

import {
  findLinkError,
  parsePlotAddress,
  plotAddress,
} from '#src/features/plots/plot-address'
import type { PlotSpec } from '#src/types'

function parse(address: string) {
  const [kind, search] = address.split('?')
  return parsePlotAddress(kind, new URLSearchParams(search))
}

test('a summary plot with chosen runs reads back from its address', () => {
  const plot: PlotSpec = {
    source: 'summary',
    variables: ['run', 'pulses'],
    runs: ['1', '2', '3', '25'],
  }

  const address = plotAddress(plot)

  expect(address).toBe('summary?x=run&y=pulses&runs=1-3,25')
  expect(parse(address)).toEqual({ plot })
})

test('a preview plot reads back from its address', () => {
  const plot: PlotSpec = {
    source: 'preview',
    variables: ['detector_image'],
    runs: ['5'],
  }

  const address = plotAddress(plot)

  expect(address).toBe('preview?variable=detector_image&runs=5')
  expect(parse(address)).toEqual({ plot })
})

test('two addresses that differ only in the order of their parts are one plot', () => {
  const first = parse('summary?x=run&y=pulses&runs=1-20,25')
  const second = parse('summary?runs=25,1-20&y=pulses&x=run')

  expect(second).toEqual(first)
})

test('an address leaves out the parts that are not the plot', () => {
  // The plot window adds its own flag to the same address.
  expect(parse('preview?variable=detector_image&runs=5&window')).toEqual({
    plot: { source: 'preview', variables: ['detector_image'], runs: ['5'] },
  })
})

test('a preview address with no runs names the runs as missing', () => {
  expect(parse('preview?variable=detector_image')).toEqual({
    error: 'The link names no runs',
  })
})

test('an address with no y names the y as missing', () => {
  expect(parse('summary?x=run')).toEqual({
    error: 'The link names no y variable',
  })
})

test('a preview address with no variable names the variable as missing', () => {
  expect(parse('preview?y=detector_image')).toEqual({
    error: 'The link names no variable',
  })
})

test('a summary address with no x names the x as missing', () => {
  expect(parse('summary?y=pulses')).toEqual({
    error: 'The link names no x variable',
  })
})

test('an address with an unknown kind names the kind', () => {
  expect(parse('sumary?x=run&y=pulses')).toEqual({
    error: '"sumary" is not a kind of plot',
  })
})

test('an address with unreadable runs names the runs', () => {
  expect(parse('preview?variable=detector_image&runs=abc')).toEqual({
    error: 'The link\'s runs are unreadable: "abc" is not a run or a range',
  })
})

const proposal = { variables: ['run', 'pulses'], runs: [1, 2, 3] }

test('a link to a variable the proposal does not have names the variable', () => {
  const plot: PlotSpec = { source: 'summary', variables: ['run', 'energy'] }

  expect(findLinkError(plot, proposal)).toBe(
    'The proposal has no variable "energy"'
  )
})

test("a link to none of the proposal's runs names the runs", () => {
  const plot: PlotSpec = {
    source: 'summary',
    variables: ['run', 'pulses'],
    runs: ['8', '9'],
  }

  expect(findLinkError(plot, proposal)).toBe(
    'The proposal has none of the runs 8-9'
  )
})

test('a link to some runs the proposal lacks is still a plot', () => {
  const plot: PlotSpec = {
    source: 'summary',
    variables: ['run', 'pulses'],
    runs: ['3', '4'],
  }

  expect(findLinkError(plot, proposal)).toBeUndefined()
})
