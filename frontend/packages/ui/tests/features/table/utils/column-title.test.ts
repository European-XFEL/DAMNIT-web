import { expect, test } from 'vitest'

import { getColumnTitle } from '#src/features/table/utils/column-title'
import type { TableMeta } from '#src/data/table/table-data.types'

// What a column holds by the time it gets here: the whole title the API sent,
// and the key of the group it belongs to.
const column = (title: string, group?: string) => ({ title, group })

const groups: TableMeta['groups'] = {
  I0: { name: 'I0', title: 'I0' },
  fel: { name: 'fel', title: 'FEL' },
  test: { name: 'test' },
}

test('drops the part of the title the group header already shows', () => {
  const intensities = column('I0/Intensities', 'I0')

  expect(getColumnTitle(intensities, groups)).toBe('Intensities')
})

test('keeps the deeper levels of a title the group does not cover', () => {
  // Titles nest further than the group does, so only the group's own level
  // goes: the header for `fel` reads FEL, and the column keeps the rest.
  const energy = column('FEL/Monochromator/ħω', 'fel')

  expect(getColumnTitle(energy, groups)).toBe('Monochromator/ħω')
})

test('keeps the whole title when the group has no title of its own', () => {
  // A dotted variable whose title carries no slash gives the server no title to
  // put on the group, so there is no prefix to remove.
  const version = column('Test v1', 'test')

  expect(getColumnTitle(version, groups)).toBe('Test v1')
})

test('keeps a title the group title does not prefix', () => {
  // A custom separator, or a title that fell back to the name, leaves nothing
  // to match, and slicing blindly would cut a word in half.
  const intensities = column('I0 :: Intensities', 'I0')

  expect(getColumnTitle(intensities, groups)).toBe('I0 :: Intensities')
})

test('keeps a title that is nothing but the group and the separator', () => {
  // The server takes the group's title from the first slash, so a title ending
  // in one leaves no leaf behind, and the header would come out blank.
  const trailing = column('I0/', 'I0')

  expect(getColumnTitle(trailing, groups)).toBe('I0/')
})

test('leaves an ungrouped variable titled as it is', () => {
  const fluence = column('Fluence [J/cm^2]')

  expect(getColumnTitle(fluence, groups)).toBe('Fluence [J/cm^2]')
})
