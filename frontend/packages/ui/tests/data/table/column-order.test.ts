import { expect, test } from 'vitest'

import { applyColumnOrder } from '#src/data/table/column-order'
import type { Variable } from '#src/data/table/table-data.types'
import { VARIABLES } from '#tests/support/columns'

const namesOf = (variables: Variable[]) =>
  variables.map((variable) => variable.name)

const SERVER_ORDER = namesOf(VARIABLES)

test('with no order of their own the columns stay as the server sent them', () => {
  expect(namesOf(applyColumnOrder(VARIABLES, []))).toEqual(SERVER_ORDER)
})

test('the columns the order lists come first, in the order it lists them', () => {
  const order = ['scan_type', 'n_trains']

  expect(namesOf(applyColumnOrder(VARIABLES, order)).slice(0, 2)).toEqual([
    'scan_type',
    'n_trains',
  ])
})

test('a column the order lists but the proposal no longer has is skipped', () => {
  const order = ['scan_type', 'xas_correlation', 'n_trains']

  expect(namesOf(applyColumnOrder(VARIABLES, order))).not.toContain(
    'xas_correlation'
  )
})

test('a column the order leaves out follows the ones it lists', () => {
  const order = ['scan_type']

  expect(namesOf(applyColumnOrder(VARIABLES, order))).toEqual([
    'scan_type',
    'n_trains',
    'sample.type',
    'sample.x',
    'sample.y',
  ])
})

test('an order the user dragged into place comes back unchanged', () => {
  const order = ['scan_type', 'sample.type', 'sample.y', 'sample.x', 'n_trains']

  expect(namesOf(applyColumnOrder(VARIABLES, order))).toEqual(order)
})

test('a variable that arrives mid-beamtime joins the end of its group', () => {
  const newcomer: Variable = {
    name: 'sample.z',
    title: 'Sample/Z [mm]',
    tags: [],
    group: 'sample',
  }
  // The order predates the newcomer, so it lands after every column it names.
  const order = SERVER_ORDER

  expect(namesOf(applyColumnOrder([...VARIABLES, newcomer], order))).toEqual([
    'n_trains',
    'sample.type',
    'sample.x',
    'sample.y',
    'sample.z',
    'scan_type',
  ])
})

test('a variable that joins a group is drawn into its block', () => {
  const joined = VARIABLES.map((variable) =>
    variable.name === 'scan_type' ? { ...variable, group: 'sample' } : variable
  )
  // The order was written while scan_type was still ungrouped and led the
  // table, which would leave the group drawn in two pieces.
  const order = ['scan_type', 'n_trains', 'sample.type', 'sample.x']

  expect(namesOf(applyColumnOrder(joined, order))).toEqual([
    'scan_type',
    'sample.type',
    'sample.x',
    'sample.y',
    'n_trains',
  ])
})
