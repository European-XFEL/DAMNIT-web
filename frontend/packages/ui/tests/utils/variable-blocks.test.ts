import { expect, test } from 'vitest'

import {
  blockKey,
  filterVariableBlocks,
  type VariableBlock,
} from '#src/utils/variable-blocks'
import { exampleBlocks } from '#tests/support/columns'

const namesOf = (blocks: VariableBlock[]) => blocks.map((block) => block.name)

test('a variable the search does not match drops out of the list', () => {
  expect(namesOf(filterVariableBlocks(exampleBlocks(), 'trains'))).toEqual([
    'n_trains',
  ])
})

test('the search ignores case and the spaces around it', () => {
  expect(namesOf(filterVariableBlocks(exampleBlocks(), '  TRAINS '))).toEqual([
    'n_trains',
  ])
})

test("typing a group's words keeps it and every member", () => {
  const [group] = filterVariableBlocks(exampleBlocks(), 'sample')

  expect(group).toMatchObject({
    name: 'sample',
    members: [
      { name: 'sample.type' },
      { name: 'sample.x' },
      { name: 'sample.y' },
    ],
  })
})

test('a group narrows to the members the search left', () => {
  const [group] = filterVariableBlocks(exampleBlocks(), 'y [mm]')

  expect(group).toMatchObject({
    name: 'sample',
    members: [{ name: 'sample.y' }],
  })
})

test('a group whose members all fail the search goes with them', () => {
  expect(namesOf(filterVariableBlocks(exampleBlocks(), 'scan'))).toEqual([
    'scan_type',
  ])
})

test('a group and a variable given the same name get different keys', () => {
  const group: VariableBlock = {
    kind: 'group',
    name: 'sample',
    title: 'Sample',
    members: [],
  }
  const variable: VariableBlock = {
    kind: 'variable',
    name: 'sample',
    title: 'Sample',
    columnTitle: 'Sample',
  }

  expect(blockKey(group)).not.toEqual(blockKey(variable))
})
