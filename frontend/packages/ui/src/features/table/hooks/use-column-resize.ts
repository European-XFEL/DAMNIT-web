import { useCallback, useRef, type RefObject } from 'react'
import {
  CompactSelection,
  type DataEditorRef,
  type GridColumn,
} from '@glideapps/glide-data-grid'

import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { selectColumnSizing } from '#src/features/table/stores/table.selectors'
import {
  columnResized,
  columnWidthsReset,
} from '#src/features/table/stores/table.slice'

// The widths the user has set, and the handlers that write them. Glide re-sends a
// drag to every selected column, so all but the grabbed one are dropped.
export function useColumnResize(
  grid: RefObject<DataEditorRef>,
  columnCount: number
) {
  const dispatch = useAppDispatch()
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
    grid.current?.remeasureColumns(
      CompactSelection.fromSingleSelection([0, columnCount])
    )
  }, [grid, columnCount])

  const resetColumnWidths = useCallback(() => {
    dispatch(columnWidthsReset({ columns: [], groups: [] }))
  }, [dispatch])

  return {
    columnSizing,
    onColumnResize,
    onColumnResizeStart,
    onColumnResizeEnd,
    fitAllColumns,
    resetColumnWidths,
  }
}
