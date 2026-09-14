import type { RefObject } from 'react'
import { renderHook } from 'vitest-browser-react'
import { describe, expect, test } from 'vitest'
import type {
  CompactSelection,
  DataEditorRef,
  GridColumn,
} from '@glideapps/glide-data-grid'

import { useColumnResize } from '#src/features/table/hooks/use-column-resize'
import { setupStore, type AppStore } from '#src/app/store/store'
import { withStore } from '#tests/support/render'

const COLUMN_COUNT = 3

function column(id: string): GridColumn {
  return { id, title: id, width: 100 }
}

// The hook reaches the grid for one thing only, so the ref is stubbed down to
// it and records which columns it was asked to measure.
function gridStub() {
  const measured: number[][] = []
  const ref = {
    current: {
      remeasureColumns: (columns: CompactSelection) => {
        measured.push([...columns])
      },
    },
  } as unknown as RefObject<DataEditorRef>
  return { ref, measured }
}

function renderResize(store: AppStore, ref = gridStub().ref) {
  return renderHook(() => useColumnResize(ref, COLUMN_COUNT), {
    wrapper: withStore(store),
  })
}

describe('useColumnResize', () => {
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

  test('a double-click fit writes its width with no drag behind it', async () => {
    const store = setupStore()
    const { result, act } = await renderResize(store)

    await act(() => {
      result.current.onColumnResize(column('xgm_intensity'), 133)
    })

    expect(store.getState().table.columnSizing).toEqual({ xgm_intensity: 133 })
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

  test('a fit after a drag that never ended writes every column it measures', async () => {
    const store = setupStore()
    const { result, act } = await renderResize(store)

    // Start a drag and never end it, the way a release outside the browser
    // leaves Glide with no mouseup to answer.
    await act(() => {
      result.current.onColumnResizeStart(column('n_trains'))
    })

    // Fit, then answer for two columns the way Glide's sweep does.
    await act(() => {
      result.current.fitAllColumns()
      result.current.onColumnResize(column('n_trains'), 120)
      result.current.onColumnResize(column('n_pulses'), 60)
    })

    expect(store.getState().table.columnSizing).toEqual({
      n_trains: 120,
      n_pulses: 60,
    })
  })
})
