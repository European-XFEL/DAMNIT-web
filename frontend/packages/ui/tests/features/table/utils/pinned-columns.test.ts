import { expect, test } from 'vitest'

import { pinnedFirst } from '#src/features/table/utils/pinned-columns'

const columns = (...names: string[]) => names.map((name) => ({ name }))
const names = (columns: { name: string }[]) => columns.map(({ name }) => name)

const PINNED = ['proposal', 'run']

test('pins run alone while the proposal column is hidden', () => {
  const { start, centre } = pinnedFirst(
    columns('run', 'start_time', 'n_trains'),
    PINNED
  )

  expect(names(start)).toEqual(['run'])
  expect(names(centre)).toEqual(['start_time', 'n_trains'])
})

test('pins the proposal column too once it is shown', () => {
  const { start } = pinnedFirst(
    columns('proposal', 'run', 'start_time'),
    PINNED
  )

  expect(names(start)).toEqual(['proposal', 'run'])
})

test('leaves nothing loose when the table has only identity columns', () => {
  const { start, centre } = pinnedFirst(columns('proposal', 'run'), PINNED)

  expect(names(start)).toEqual(['proposal', 'run'])
  expect(centre).toEqual([])
})

test('moves the pinned columns to the front of a list that does not lead with them', () => {
  const { start, centre } = pinnedFirst(
    columns('n_trains', 'run', 'start_time'),
    PINNED
  )

  expect(names(start)).toEqual(['run'])
  expect(names(centre)).toEqual(['n_trains', 'start_time'])
})

test('pins in the order the columns are pinned, not the order they arrive', () => {
  const { start } = pinnedFirst(
    columns('run', 'proposal', 'start_time'),
    PINNED
  )

  expect(names(start)).toEqual(['proposal', 'run'])
})
