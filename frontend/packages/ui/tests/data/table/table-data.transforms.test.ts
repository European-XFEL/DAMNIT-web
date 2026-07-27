import { describe, expect, test } from 'vitest'

import {
  heavyCellNames,
  indexRunCells,
  runKey,
} from '#src/data/table/table-data.transforms'
import type {
  CellError,
  CellValue,
  Run,
} from '#src/data/table/table-data.types'

type CellInput = {
  name: string
  value: CellValue
  dtype: string
  error: CellError | null
}

function cell(
  name: string,
  value: CellValue,
  dtype = 'number',
  error: CellError | null = null
): CellInput {
  return { name, value, dtype, error }
}

function run(proposal: string, number: number, cells: CellInput[]): Run {
  return {
    database: proposal,
    proposal,
    run: number,
    cells: cells.map((entry) => ({
      id: `${proposal}:${number}:${entry.name}`,
      name: entry.name,
      error: entry.error,
      summary: { value: entry.value, dtype: entry.dtype },
    })),
  }
}

describe('indexRunCells', () => {
  test('keys each run by its (proposal, run) identity', () => {
    const cells = indexRunCells([
      run('900405', 5, [cell('energy', 1.2)]),
      run('900405', 9, [cell('energy', 3.4)]),
    ])

    expect([...cells.keys()]).toEqual(['900405:5', '900405:9'])
    expect(cells.get('900405:5')?.energy).toEqual({
      id: '900405:5:energy',
      name: 'energy',
      error: null,
      summary: { value: 1.2, dtype: 'number' },
    })
  })

  test('keeps runs that share a number across proposals apart', () => {
    // The same run number in two proposals is two rows, not one, which is the
    // whole reason a run is keyed by the pair.
    const cells = indexRunCells([
      run('900405', 1, [cell('energy', 1.2)]),
      run('900485', 1, [cell('energy', 9.9)]),
    ])

    expect(cells.get('900405:1')?.energy.summary.value).toBe(1.2)
    expect(cells.get('900485:1')?.energy.summary.value).toBe(9.9)
  })

  test('stores each cell by its variable name', () => {
    const error = { cls: 'ValueError', message: 'boom' }
    const cells = indexRunCells([
      run('900405', 1, [cell('x', 2, 'number', error)]),
    ])
    expect(cells.get('900405:1')?.x).toEqual({
      id: '900405:1:x',
      name: 'x',
      error,
      summary: { value: 2, dtype: 'number' },
    })
  })
  test('reuses a run’s cell map while the run object is unchanged', () => {
    const runA = run('900405', 1, [cell('energy', 1.2)])

    // A later push hands back a new array but the same unchanged run object, so
    // its already-built cell map comes back rather than being rebuilt.
    const first = indexRunCells([runA]).get('900405:1')
    const second = indexRunCells([runA]).get('900405:1')

    expect(second).toBe(first)
  })

  test('rebuilds only the run whose object changed', () => {
    const runA = run('900405', 1, [cell('energy', 1.2)])
    const runB = run('900405', 2, [cell('energy', 3.4)])
    const first = indexRunCells([runA, runB])

    // runB is replaced with a fresh object (its value changed); runA is untouched.
    const runBNext = run('900405', 2, [cell('energy', 9.9)])
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
  cell(name, null, 'array', error)

describe('heavyCellNames', () => {
  test('names the blanked cells worth a second fetch', () => {
    const names = heavyCellNames([
      run('900405', 1, [cell('energy', 1.2), blanked('spectrum')]),
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
})
