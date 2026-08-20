import { describe, expect, test } from 'vitest'

import type { TableMeta } from '#src/data/table/table-data.types'
import {
  buildVariableRecords,
  filterVariableRecords,
  type VariableTableRecord,
} from '#src/features/table/utils/variable-records'

// Names and titles from FXE/202601/p010236: two groups whose leaf titles collide
// on "Intensities", with an ungrouped column ahead of them and one behind. The
// `test` group is p010692's, whose titles carry no slash for the server to cut.
const VARIABLES: TableMeta['variables'] = {
  n_trains: { name: 'n_trains', title: 'Trains', tags: [] },
  'I0.intensities': {
    name: 'I0.intensities',
    title: 'I0/Intensities',
    tags: [],
    group: 'I0',
  },
  'If.intensities': {
    name: 'If.intensities',
    title: 'If/Intensities',
    tags: [],
    group: 'If',
  },
  'If.peaks': {
    name: 'If.peaks',
    title: 'If/Peaks check',
    tags: [],
    group: 'If',
  },
  xas_correlation: {
    name: 'xas_correlation',
    title: 'XAS correlation',
    tags: [],
  },
  'test.v1': { name: 'test.v1', title: 'Test v1', tags: [], group: 'test' },
}

const GROUPS: TableMeta['groups'] = {
  I0: { name: 'I0', title: 'I0' },
  If: { name: 'If', title: 'If' },
  test: { name: 'test' },
}

const ALL_VISIBLE = Object.fromEntries(
  Object.keys(VARIABLES).map((name) => [name, true])
)

const build = (
  visibility = ALL_VISIBLE,
  tagFilter: Record<string, boolean> | null = null
) =>
  buildVariableRecords({
    variables: VARIABLES,
    groups: GROUPS,
    visibility,
    tagFilter,
  })

const namesOf = (records: VariableTableRecord[]) =>
  records.map((record) => `${record.kind}:${record.name}`)

const groupNamed = (records: VariableTableRecord[], name: string) =>
  records.find((record) => record.kind === 'group' && record.name === name)

describe('buildVariableRecords', () => {
  test('puts a group row above its first member and keeps table order', () => {
    expect(namesOf(build())).toEqual([
      'variable:n_trains',
      'group:I0',
      'variable:I0.intensities',
      'group:If',
      'variable:If.intensities',
      'variable:If.peaks',
      'variable:xas_correlation',
      'group:test',
      'variable:test.v1',
    ])
  })

  test('a group with no title of its own shows its key', () => {
    expect(groupNamed(build(), 'test')).toMatchObject({ title: 'test' })
  })

  test('a member row shows the title without the words its group carries', () => {
    const peaks = build().find((record) => record.name === 'If.peaks')
    expect(peaks).toMatchObject({
      title: 'If/Peaks check',
      columnTitle: 'Peaks check',
    })
  })

  test('a group lists every member, hidden ones included', () => {
    const records = build({ ...ALL_VISIBLE, 'If.peaks': false })
    expect(groupNamed(records, 'If')).toMatchObject({
      members: ['If.intensities', 'If.peaks'],
    })
  })

  test('a group whose members all show is visible outright', () => {
    expect(groupNamed(build(), 'If')).toMatchObject({ isVisible: true })
  })

  test('a group with one member hidden is not visible', () => {
    const records = build({ ...ALL_VISIBLE, 'If.peaks': false })
    expect(groupNamed(records, 'If')).toMatchObject({ isVisible: false })
  })

  test('with no tag selected every row passes the tag filter', () => {
    const records = build()
    expect(records.every((record) => record.passesTagFilter)).toBe(true)
  })

  test('a group passes while one member survives the tag filter', () => {
    const records = build(ALL_VISIBLE, {
      'If.intensities': false,
      'If.peaks': true,
    })
    expect(groupNamed(records, 'If')?.passesTagFilter).toBe(true)
  })

  test('a group fails the tag filter only when every member does', () => {
    const records = build(ALL_VISIBLE, {
      'If.intensities': false,
      'If.peaks': false,
    })
    expect(groupNamed(records, 'If')?.passesTagFilter).toBe(false)
  })

  test('a column the user cannot configure gets no row', () => {
    const configurable = { ...ALL_VISIBLE }
    delete configurable.n_trains

    expect(namesOf(build(configurable))).not.toContain('variable:n_trains')
  })

  test('a variable answers the tag filter for itself', () => {
    const records = build(ALL_VISIBLE, { n_trains: false })
    const trains = records.find((record) => record.name === 'n_trains')
    expect(trains?.passesTagFilter).toBe(false)
  })
})

describe('filterVariableRecords', () => {
  test('an empty query keeps every row', () => {
    const records = build()
    expect(filterVariableRecords(records, '')).toEqual(records)
  })

  test('a group name keeps the group and its members', () => {
    expect(namesOf(filterVariableRecords(build(), 'i0'))).toEqual([
      'group:I0',
      'variable:I0.intensities',
    ])
  })

  // The row shows the stripped title but the search reads the whole one, so a
  // leaf that two groups share is found under either group's name.
  test('a leaf title shared by two groups keeps both groups', () => {
    expect(namesOf(filterVariableRecords(build(), 'intensities'))).toEqual([
      'group:I0',
      'variable:I0.intensities',
      'group:If',
      'variable:If.intensities',
    ])
  })

  test('an ungrouped variable matches on its own title', () => {
    expect(namesOf(filterVariableRecords(build(), 'trains'))).toEqual([
      'variable:n_trains',
    ])
  })

  test('a query nothing matches keeps no rows', () => {
    expect(filterVariableRecords(build(), 'nothing')).toEqual([])
  })

  test('a group lists only the members the search left on screen', () => {
    const records = filterVariableRecords(build(), 'intensities')

    expect(groupNamed(records, 'If')).toMatchObject({
      members: ['If.intensities'],
    })
  })

  test('a group is visible when the members it still shows are', () => {
    const records = filterVariableRecords(
      build({ ...ALL_VISIBLE, 'If.peaks': false }),
      'intensities'
    )

    expect(groupNamed(records, 'If')).toMatchObject({ isVisible: true })
  })

  test('a group answers the tag filter for the members it still shows', () => {
    const records = filterVariableRecords(
      build(ALL_VISIBLE, { 'If.intensities': false, 'If.peaks': true }),
      'intensities'
    )

    expect(groupNamed(records, 'If')?.passesTagFilter).toBe(false)
  })
})
