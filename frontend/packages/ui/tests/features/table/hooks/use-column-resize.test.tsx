import type { RefObject } from 'react'
import { renderHook } from 'vitest-browser-react'
import { expect, test } from 'vitest'
import type {
  CompactSelection,
  DataEditorRef,
  GridColumn,
} from '@glideapps/glide-data-grid'

import { useColumnResize } from '#src/features/table/hooks/use-column-resize'
import { columnResized } from '#src/features/table/stores/table.slice'
import type { TableColumn } from '#src/features/table/types/table.types'
import { setupStore, type AppStore } from '#src/app/store/store'
import { withStore } from '#tests/support/render'

const COLUMNS: TableColumn[] = [
  { id: 'n_trains', title: 'n_trains' },
  { id: 'xgm_intensity', title: 'XGM / intensity', group: 'XGM' },
  { id: 'xgm_energy', title: 'XGM / energy', group: 'XGM' },
]

function column(id: string): GridColumn {
  return { id, title: id, width: 100 }
}

// Answers inside remeasureColumns, the way Glide's sweep does. The ref exists
// before the hook, so a test binds `answer` to its handler after the render.
function gridStub(fitted: Record<string, number> = {}) {
  const measured: number[][] = []
  const answer: {
    onColumnResize?: (column: GridColumn, width: number) => void
  } = {}
  const ref = {
    current: {
      remeasureColumns: (selection: CompactSelection) => {
        measured.push([...selection])
        for (const index of selection) {
          const id = COLUMNS[index]?.id
          if (id != null && fitted[id] != null) {
            answer.onColumnResize?.(column(id), fitted[id])
          }
        }
      },
    },
  } as unknown as RefObject<DataEditorRef>
  return { ref, measured, answer }
}

function renderResize(store: AppStore, ref = gridStub().ref) {
  return renderHook(() => useColumnResize(ref, COLUMNS), {
    wrapper: withStore(store),
  })
}

test('a drag writes the width of the column that was grabbed', async () => {
  const store = setupStore()
  const { result, act } = await renderResize(store)

  await act(() => {
    result.current.onColumnResizeStart(column('n_trains'))
    result.current.onColumnResize(column('n_trains'), 240)
    result.current.onColumnResizeEnd()
  })

  expect(store.getState().table.columnSizing).toEqual({ n_trains: 240 })
})

test('a drag ignores the columns Glide re-sends it to', async () => {
  const store = setupStore()
  const { result, act } = await renderResize(store)

  await act(() => {
    result.current.onColumnResizeStart(column('n_trains'))
    // Glide re-sends the same resize to every other selected column.
    result.current.onColumnResize(column('n_pulses'), 240)
    result.current.onColumnResize(column('n_trains'), 240)
    result.current.onColumnResizeEnd()
  })

  expect(store.getState().table.columnSizing).toEqual({ n_trains: 240 })
})

test('a drag changes a width without flashing it', async () => {
  const store = setupStore()
  const { result, act } = await renderResize(store)

  await act(() => {
    result.current.onColumnResizeStart(column('n_trains'))
    result.current.onColumnResize(column('n_trains'), 240)
    result.current.onColumnResizeEnd()
  })

  expect(store.getState().table.lastFlash).toBeNull()
})

test('a double-click fit writes its width with no drag behind it', async () => {
  const store = setupStore()
  const { result, act } = await renderResize(store)

  await act(() => {
    result.current.onColumnResize(column('xgm_intensity'), 133)
  })

  expect(store.getState().table.columnSizing).toEqual({ xgm_intensity: 133 })
})

test('a double-click fit changes a width without flashing it', async () => {
  const store = setupStore()
  const { result, act } = await renderResize(store)

  await act(() => {
    result.current.onColumnResize(column('xgm_intensity'), 133)
  })

  expect(store.getState().table.lastFlash).toBeNull()
})

test('a fit after a drag is not mistaken for the finished drag', async () => {
  const store = setupStore()
  const { result, act } = await renderResize(store)

  // Drag one column, then release.
  await act(() => {
    result.current.onColumnResizeStart(column('n_trains'))
    result.current.onColumnResize(column('n_trains'), 240)
    result.current.onColumnResizeEnd()
  })

  // Fit a different column, which arrives with no start event.
  await act(() => {
    result.current.onColumnResize(column('n_pulses'), 80)
  })

  expect(store.getState().table.columnSizing).toEqual({
    n_trains: 240,
    n_pulses: 80,
  })
})

test('fitting every column asks the grid to measure each one', async () => {
  const { ref, measured } = gridStub()
  const { result, act } = await renderResize(setupStore(), ref)

  await act(() => {
    result.current.fitAllColumns()
  })

  expect(measured).toEqual([[0, 1, 2]])
})

test('fitting every column flashes only the columns whose width changed', async () => {
  const store = setupStore()
  const { ref, answer } = gridStub({
    n_trains: 100,
    xgm_intensity: 180,
    xgm_energy: 90,
  })
  const { result, act } = await renderResize(store, ref)
  answer.onColumnResize = result.current.onColumnResize

  await act(() => {
    result.current.fitAllColumns()
  })

  expect(store.getState().table.lastFlash).toMatchObject({
    columns: ['xgm_intensity', 'xgm_energy'],
    groups: ['XGM'],
  })
})

test('a fit after a drag that never ended writes every column it measures', async () => {
  const store = setupStore()
  const { ref, answer } = gridStub({ n_trains: 120, xgm_energy: 60 })
  const { result, act } = await renderResize(store, ref)
  answer.onColumnResize = result.current.onColumnResize

  // Start a drag and never end it, the way a release outside the browser
  // leaves Glide with no mouseup to answer.
  await act(() => {
    result.current.onColumnResizeStart(column('n_trains'))
  })

  await act(() => {
    result.current.fitAllColumns()
  })

  expect(store.getState().table.columnSizing).toEqual({
    n_trains: 120,
    xgm_energy: 60,
  })
})

test('resetting widths flashes the columns that were not at the default', async () => {
  const store = setupStore()
  store.dispatch(columnResized({ variable: 'xgm_intensity', width: 240 }))
  const { result, act } = await renderResize(store)

  await act(() => {
    result.current.resetColumnWidths()
  })

  expect(store.getState().table.lastFlash).toMatchObject({
    columns: ['xgm_intensity'],
    groups: [],
  })
})
