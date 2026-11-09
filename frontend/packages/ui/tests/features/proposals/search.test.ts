import { describe, expect, test } from 'vitest'

import {
  matchesQuery,
  parseQuery,
  toggleInstrument,
} from '#src/features/proposals/search'

const INSTRUMENTS = ['MID', 'SCS']

const PROPOSAL = {
  number: 6996,
  instrument: 'MID',
  principal_investigator: 'Christian Gutt',
  title: 'MHz XPCS studies of proteins',
}

describe('parseQuery', () => {
  test('reads leading instrument names, ignoring case', () => {
    expect(parseQuery('mid Scs Gutt', INSTRUMENTS)).toEqual({
      instruments: ['MID', 'SCS'],
      terms: ['Gutt'],
    })
  })

  test('treats an instrument name after other words as a search term', () => {
    expect(parseQuery('gutt mid', INSTRUMENTS)).toEqual({
      instruments: [],
      terms: ['gutt', 'mid'],
    })
  })
})

describe('matchesQuery', () => {
  const matches = (query: string) =>
    matchesQuery(PROPOSAL, parseQuery(query, INSTRUMENTS))

  test('filters by instrument', () => {
    expect(matches('mid')).toBe(true)
    expect(matches('scs')).toBe(false)
  })

  test('searches the number, the PI and the title, ignoring case', () => {
    expect(matches('699')).toBe(true)
    expect(matches('GUTT')).toBe(true)
    expect(matches('protein')).toBe(true)
    expect(matches('smith')).toBe(false)
  })

  test('needs every term to match', () => {
    expect(matches('gutt protein')).toBe(true)
    expect(matches('gutt smith')).toBe(false)
  })
})

describe('toggleInstrument', () => {
  const toggle = (query: string, instrument: string) =>
    toggleInstrument(parseQuery(query, INSTRUMENTS), instrument)

  test('adds and removes an instrument at the start of the query', () => {
    expect(toggle('gutt', 'SCS')).toBe('SCS gutt')
    expect(toggle('MID SCS gutt', 'MID')).toBe('SCS gutt')
  })
})
