import { useCallback, useRef, type RefObject } from 'react'
import {
  CompactSelection,
  type DataEditorRef,
  type GridColumn,
} from '@glideapps/glide-data-grid'

import {
  useAppDispatch,
  useAppSelector,
  useAppStore,
} from '#src/app/store/hooks'
import { selectColumnSizing } from '#src/features/table/stores/table.selectors'
import {
  columnResized,
  columnsFitted,
  columnWidthsReset,
} from '#src/features/table/stores/table.slice'
import type { TableColumn } from '#src/features/table/types/table.types'
import { changedWidths } from '#src/features/table/utils/column-widths'

// The widths the user has set, and the handlers that write them. Glide re-sends a
// drag to every selected column, so all but the grabbed one are dropped.
export function useColumnResize(
  grid: RefObject<DataEditorRef>,
  columns: TableColumn[]
) {
  const dispatch = useAppDispatch()
  // Read when clicked, so a drag frame does not hand the toolbar new handlers.
  const store = useAppStore()
  const columnSizing = useAppSelector(selectColumnSizing)

  // The column being resized, empty between gestures.
  const draggedVariable = useRef<string>()

  const onColumnResizeStart = useCallback((column: GridColumn) => {
    draggedVariable.current = column.id
  }, [])

  const onColumnResizeEnd = useCallback(() => {
    draggedVariable.current = undefined
  }, [])

  // Keyed by variable name, not index, so a width follows the variable when the
  // columns move. An empty `dragged` is a fit, with no drag behind it.
  const onColumnResize = useCallback(
    (column: GridColumn, newSize: number) => {
      const variable = column.id
      const dragged = draggedVariable.current
      if (!variable || (dragged && variable !== dragged)) {
        return
      }

      dispatch(columnResized({ variable, width: newSize }))
    },
    [dispatch]
  )

  // Glide measures the rows on screen and answers through onColumnResize, one
  // column at a time, the same way its double-click fit does.
  const fitAllColumns = useCallback(() => {
    // Glide ends a drag on a window mouseup, which a release outside the
    // browser never fires; a stranded ref would filter this sweep to one column.
    draggedVariable.current = undefined
    const before = store.getState().table.columnSizing
    grid.current?.remeasureColumns(
      CompactSelection.fromSingleSelection([0, columns.length])
    )
    // Glide answers every column before remeasureColumns returns. If that ever
    // goes async, the widths still land and only the flash is lost.
    const after = store.getState().table.columnSizing
    dispatch(columnsFitted(changedWidths({ columns, before, after })))
  }, [grid, columns, dispatch, store])

  const resetColumnWidths = useCallback(() => {
    const before = store.getState().table.columnSizing
    dispatch(columnWidthsReset(changedWidths({ columns, before, after: {} })))
  }, [columns, dispatch, store])

  return {
    columnSizing,
    onColumnResize,
    onColumnResizeStart,
    onColumnResizeEnd,
    fitAllColumns,
    resetColumnWidths,
  }
}
