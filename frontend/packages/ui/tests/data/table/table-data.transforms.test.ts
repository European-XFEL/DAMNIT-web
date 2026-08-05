import { describe, expect, test } from 'vitest'

import {
  getTitleByName,
  getVariableTitle,
  heavyCellNames,
  indexRunCells,
  runKey,
} from '#src/data/table/table-data.transforms'
import type {
  Cell,
  CellError,
  CellValue,
  Run,
  Variable,
} from '#src/data/table/table-data.types'

// These transforms key cells by name and never read `id`, so it only has to be
// present, not realistic.
function cell({
  name,
  value,
  dtype = 'number',
  error = null,
}: CellOptions): Cell {
  return { id: name, name, error, summary: { value, dtype } }
}

type CellOptions = {
  name: string
  value: CellValue
  dtype?: string
  error?: CellError | null
}

function run(proposal: string, number: number, cells: Cell[]): Run {
  return { database: proposal, proposal, run: number, cells }
}

describe('indexRunCells', () => {
  test('keys each run by its (proposal, run) identity', () => {
    const cells = indexRunCells([
      run('900405', 5, [cell({ name: 'energy', value: 1.2 })]),
      run('900405', 9, [cell({ name: 'energy', value: 3.4 })]),
    ])

    expect([...cells.keys()]).toEqual(['900405:5', '900405:9'])
    expect(cells.get('900405:5')?.energy).toEqual({
      id: 'energy',
      name: 'energy',
      error: null,
      summary: { value: 1.2, dtype: 'number' },
    })
  })

  test('keeps runs that share a number across proposals apart', () => {
    // The same run number in two proposals is two rows, not one, which is the
    // whole reason a run is keyed by the pair.
    const cells = indexRunCells([
      run('900405', 1, [cell({ name: 'energy', value: 1.2 })]),
      run('900485', 1, [cell({ name: 'energy', value: 9.9 })]),
    ])

    expect(cells.get('900405:1')?.energy.summary.value).toBe(1.2)
    expect(cells.get('900485:1')?.energy.summary.value).toBe(9.9)
  })

  test('stores each cell by its variable name', () => {
    const error = { cls: 'ValueError', message: 'boom' }
    const cells = indexRunCells([
      run('900405', 1, [cell({ name: 'x', value: 2, error })]),
    ])
    expect(cells.get('900405:1')?.x).toEqual({
      id: 'x',
      name: 'x',
      error,
      summary: { value: 2, dtype: 'number' },
    })
  })
  test('reuses a run’s cell map while the run object is unchanged', () => {
    const runA = run('900405', 1, [cell({ name: 'energy', value: 1.2 })])

    // A later push hands back a new array but the same unchanged run object, so
    // its already-built cell map comes back rather than being rebuilt.
    const first = indexRunCells([runA]).get('900405:1')
    const second = indexRunCells([runA]).get('900405:1')

    expect(second).toBe(first)
  })

  test('rebuilds only the run whose object changed', () => {
    const runA = run('900405', 1, [cell({ name: 'energy', value: 1.2 })])
    const runB = run('900405', 2, [cell({ name: 'energy', value: 3.4 })])
    const first = indexRunCells([runA, runB])

    // runB is replaced with a fresh object (its value changed); runA is untouched.
    const runBNext = run('900405', 2, [cell({ name: 'energy', value: 9.9 })])
    const second = indexRunCells([runA, runBNext])

    expect(second.get('900405:1')).toBe(first.get('900405:1'))
    expect(second.get('900405:2')).not.toBe(first.get('900405:2'))
    expect(second.get('900405:2')?.energy.summary.value).toBe(9.9)
  })
})

test('runKey pairs proposal and run into a lookup key', () => {
  expect(runKey({ proposal: '900405', run: 143 })).toBe('900405:143')
})

// A heavy value the @lightweight directive held back: the server sends the cell
// with its summary value nulled out.
const blanked = (name: string, error: CellError | null = null) =>
  cell({ name, value: null, dtype: 'array1d', error })

describe('heavyCellNames', () => {
  test('names the blanked cells worth a second fetch', () => {
    const names = heavyCellNames([
      run('900405', 1, [
        cell({ name: 'energy', value: 1.2 }),
        blanked('spectrum'),
      ]),
    ])

    expect(names).toEqual(['spectrum'])
  })

  test('leaves out a cell that failed rather than being held back', () => {
    // A blank carrying an error is a cell that genuinely has no value, so
    // fetching it again would only return the same error.
    const names = heavyCellNames([
      run('900405', 1, [
        blanked('broken', { cls: 'ValueError', message: 'boom' }),
      ]),
    ])

    expect(names).toEqual([])
  })

  test('names a cell once however many runs blanked it', () => {
    const names = heavyCellNames([
      run('900405', 1, [blanked('spectrum')]),
      run('900405', 2, [blanked('spectrum')]),
    ])

    expect(names).toEqual(['spectrum'])
  })

  test('leaves out a genuinely-empty scalar cell', () => {
    // A null scalar (no error, non-heavy dtype) is a deleted-for-this-run
    // value, not a held-back heavy blank, so re-fetching it would loop forever.
    const empty = cell({ name: 'note', value: null, dtype: 'string' })
    const names = heavyCellNames([run('900405', 1, [empty])])

    expect(names).toEqual([])
  })
})

const variable = (name: string, title?: string): Variable => ({
  name,
  title,
  tags: [],
})

describe('getVariableTitle', () => {
  test('shows the title the context file gave the variable', () => {
    expect(getVariableTitle(variable('energy', 'Photon energy'))).toBe(
      'Photon energy'
    )
  })

  test('shows the name when nobody titled the variable', () => {
    expect(getVariableTitle(variable('energy'))).toBe('energy')
  })

  test('shows the name when the title is blank', () => {
    // DAMNIT's title column is free text, so an empty one is a title the user
    // cleared rather than one they set to nothing.
    expect(getVariableTitle(variable('energy', ''))).toBe('energy')
  })
})

describe('getTitleByName', () => {
  test('finds a variable by name and shows its title', () => {
    const variables = { energy: variable('energy', 'Photon energy') }

    expect(getTitleByName(variables, 'energy')).toBe('Photon energy')
  })

  test('shows the name when the variable is gone from the context file', () => {
    // A plot outlives the variable it charts, so its axis still needs a label.
    expect(getTitleByName({}, 'energy')).toBe('energy')
  })

  test('shows the name when the variable is named after a built-in', () => {
    expect(getTitleByName({}, 'constructor')).toBe('constructor')
  })
})
