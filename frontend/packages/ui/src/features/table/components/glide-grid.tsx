import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type ForwardedRef,
} from 'react'
import {
  blend,
  CompactSelection,
  DataEditorCore,
  getDefaultTheme,
  ImageWindowLoaderImpl,
  sprites,
  withAlpha,
  type BaseDrawArgs,
  type CellClickedEventArgs,
  type DataEditorRef,
  type DrawCellCallback,
  type DrawHeaderCallback,
  type GridMouseEventArgs,
  type GridSelection,
  type GroupHeaderClickedEventArgs,
  type HeaderClickedEventArgs,
  type Item,
  type Rectangle,
  type Theme,
} from '@glideapps/glide-data-grid'
import { useMantineTheme } from '@mantine/core'
import { isEqual } from 'lodash-es'

import { VARIABLES } from '#src/constants'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { runKey } from '#src/data/table/table-data.transforms'
import { isEmpty } from '#src/utils/helpers'
import { FONT_FAMILY_SANS, FONT_SIZE_DATA, FONT_SIZES } from '#src/styles/fonts'
import {
  errorCell,
  getCell,
  GRID_RENDERERS,
  makeCellRenderers,
  normalizedXAt,
  numberCell,
  textCell,
} from '#src/features/table/utils/cells'
import { getColumnTitle, getGroupTitle } from '#src/data/table/column-title'
import { leftBorder } from '#src/features/table/utils/column-lines'
import { DEFAULT_COLUMN_WIDTH } from '#src/features/table/utils/column-widths'
import { useRehoverAtCursor } from '#src/features/table/hooks/use-rehover-at-cursor'
import { useScrollToView } from '#src/features/table/hooks/use-scroll-to-view'
import { useColumnResize } from '#src/features/table/hooks/use-column-resize'
import { useColumnFlash } from '#src/features/table/hooks/use-column-flash'
import { useSelectedRun } from '#src/features/table/hooks/use-selected-run'
import type {
  CellId,
  RunGridProps,
  RunGridRef,
} from '#src/features/table/types/table.types'
import {
  toCurrent,
  toSelectedCells,
  toSelectedRun,
  type ColumnIndex,
  type RowIndex,
} from '#src/features/table/utils/grid-selection'
import {
  selectRowSelection,
  selectSelectedCells,
  selectSelectedColumns,
} from '#src/features/table/stores/table.selectors'
import {
  gridSelectionChanged,
  runDeselected,
  runSelected,
} from '#src/features/table/stores/table.slice'

// Matches the row height of desktop DAMNIT, the spreadsheet where these users
// already read their runs.
const ROW_HEIGHT = 30

// One row tall, as a spreadsheet's column header is.
const HEADER_HEIGHT = 30

// Shorter than the title row below it: Glide paints both rows in the same
// font on the same background, so height is the only lever left.
const GROUP_HEADER_HEIGHT = 24

// Glide draws in px: its defaults scaled by the theme's 6%, the marker lifted
// to the 12 px floor, and headers at 500 to sit a step over the cells.
const GRID_FONTS: Partial<Theme> = {
  fontFamily: FONT_FAMILY_SANS,
  baseFontStyle: `${FONT_SIZE_DATA}px`,
  headerFontStyle: `500 ${FONT_SIZE_DATA}px`,
  markerFontStyle: `${FONT_SIZES.xxs}px`,
}

// Starts under the row line, which a one-cell repaint leaves standing. Without
// the restore, Glide's cached fill style would draw the next cell's text in it.
function paintInnerLine(
  ctx: CanvasRenderingContext2D,
  { rect, color }: { rect: Rectangle; color: string }
) {
  ctx.save()
  ctx.fillStyle = color
  ctx.fillRect(rect.x, rect.y + 1, 1, rect.height - 1)
  ctx.restore()
}

// Glide gives a click relative to its cell; the menu wants the viewport point.
function toClientPoint(event: CellClickedEventArgs | HeaderClickedEventArgs) {
  return {
    x: event.bounds.x + event.localEventX,
    y: event.bounds.y + event.localEventY,
  }
}

function GlideGrid(
  {
    columns: tableColumns,
    pinnedCount,
    groups,
    runs,
    cellsByKey,
    lastUpdatedByKey,
    onVisibleRegionChanged,
    onScroll,
    onCellHovered,
    onCellMouseMove,
    onCellActivated,
    onCellContextMenu,
    onHeaderContextMenu,
  }: RunGridProps,
  ref: ForwardedRef<RunGridRef>
) {
  const tableRef = useRef<DataEditorRef>(null)

  const dispatch = useAppDispatch()
  const {
    onVisibleRegionChanged: scrollToViewHandler,
    scrollX,
    scrollY,
  } = useScrollToView(tableRef)
  const rehoverAtCursor = useRehoverAtCursor()
  const {
    columnSizing,
    onColumnResize,
    onColumnResizeStart,
    onColumnResizeEnd,
    fitAllColumns,
    resetColumnWidths,
  } = useColumnResize(tableRef, tableColumns)
  useImperativeHandle(ref, () => ({ fitAllColumns, resetColumnWidths }), [
    fitAllColumns,
    resetColumnWidths,
  ])
  const theme = useMantineTheme()

  // What the grid draws: the title without the level its group header already
  // shows. Everywhere else keeps the whole title, plot labels included.
  // Glide's accessibility mirror has one header row and no group bar, so a
  // screen reader hears this stripped title with nothing to disambiguate it.
  const gridColumns = useMemo(
    () =>
      tableColumns.map((column) => ({
        ...column,
        title: getColumnTitle(column, groups),
        width: columnSizing[column.id] ?? DEFAULT_COLUMN_WIDTH,
      })),
    [tableColumns, groups, columnSizing]
  )

  // The box over the ungrouped columns carries no label, so a click on it means
  // nothing. Glide would otherwise select the whole run, pinned Run included.
  const handleGroupHeaderClicked = (
    col: number,
    event: GroupHeaderClickedEventArgs
  ) => {
    if (!tableColumns[col]?.group) {
      event.preventDefault()
    }
  }

  // Error-glyph colors resolved from the live theme; dark mode plugs in here.
  const renderers = useMemo(
    () =>
      makeCellRenderers(
        {
          error: theme.colors.red[6],
          missing: theme.colors.gray[5],
          skipped: theme.colors.gray[5],
        },
        DEFAULT_COLUMN_WIDTH
      ),
    [theme]
  )
  // The core editor takes Glide's renderers from here, so it also takes the
  // image loader and header icons the default editor would add.
  const imageWindowLoader = useMemo(() => new ImageWindowLoaderImpl(), [])

  // Glide paints from resolved colors, not CSS variables, so its header and
  // group bar take the gray ramp the rest of the chrome is on.
  const gridTheme = useMemo<Partial<Theme>>(
    () => ({
      ...GRID_FONTS,
      bgHeader: theme.colors.gray[0],
      bgHeaderHovered: theme.colors.gray[1],
      bgHeaderHasFocus: theme.colors.gray[2],
      // Glide draws the group band's separators, the pinned edge and every
      // vertical line in borderColor; the rows take the lighter one.
      borderColor: theme.colors.gray[3],
      horizontalBorderColor: theme.colors.gray[2],
      textDark: theme.black,
      textHeader: theme.black,
      // A group name is a label over its columns, the treatment it already has
      // in the popover and the nav.
      textGroupHeader: theme.colors.gray[7],
      accentColor: theme.colors.indigo[7],
    }),
    [theme]
  )

  // Glide fills the row numbers with the cell background, so they take the
  // header's gray here, and the index reads in the secondary gray.
  const rowMarkers = useMemo(
    () => ({
      kind: 'clickable-number' as const,
      theme: {
        bgCell: theme.colors.gray[0],
        textLight: theme.colors.gray[7],
      },
    }),
    [theme]
  )

  // Row layout is the server-ordered run list; a cell's value is looked up by
  // the run's identity from the normalized cache.
  const getContent = useCallback(
    ([col, row]: Item) => {
      const identity = runs[row]
      const variable = tableColumns[col]?.id

      if (variable === VARIABLES.run) {
        return numberCell(identity?.run)
      }

      if (!identity) {
        return textCell('')
      }

      const key = runKey(identity)
      const cell = cellsByKey.get(key)?.get(variable)
      if (!cell) {
        return textCell('')
      }

      if (cell.error) {
        return errorCell(cell.error)
      }

      return getCell({
        value: cell.summary.value,
        dtype: cell.summary.dtype,
        options: { lastUpdated: lastUpdatedByKey.get(key) },
      })
    },
    [tableColumns, runs, cellsByKey, lastUpdatedByKey]
  )

  const selectedColumns = useAppSelector(selectSelectedColumns)
  const selectedCells = useAppSelector(selectSelectedCells)
  const rowSelection = useAppSelector(selectRowSelection)
  const selectedRun = useSelectedRun()

  const toCellId = ([col, row]: Item): CellId | undefined => {
    const run = runs[row]
    const variable = tableColumns[col]?.id
    if (!run || !variable) {
      return undefined
    }

    return { run, variable }
  }

  const toHoveredCell = (args: GridMouseEventArgs) => {
    if (args.kind !== 'cell') {
      return undefined
    }

    const cell = toCellId(args.location)
    if (!cell) {
      return undefined
    }

    return {
      ...cell,
      bounds: args.bounds,
      normalizedX: normalizedXAt({
        hoverX: args.localEventX,
        width: args.bounds.width,
      }),
    }
  }

  // A row marker clicked off and the last column unselected reach Glide's
  // change handler as the same empty selection; only the header takes Ctrl/Cmd.
  const pointerOnHeader = useRef(false)
  const handleGridItemHovered = (args: GridMouseEventArgs) => {
    pointerOnHeader.current =
      (args.kind === 'header' || args.kind === 'group-header') && !args.isTouch
    onCellHovered(toHoveredCell(args))
  }
  const handleGridMouseMove = (args: GridMouseEventArgs) => {
    onCellMouseMove(toHoveredCell(args))
  }

  // Glide reports a key's selection change before its keydown returns, so the
  // flag marks exactly that change, whatever the pointer rests on.
  const keyPressed = useRef(false)
  const handleGridKeyDown = () => {
    keyPressed.current = true
    queueMicrotask(() => {
      keyPressed.current = false
    })
  }

  // Kept apart from the selection below: the two indices turn over with the
  // table, while the selection turns over with every click and every mouse-move
  // of a range drag, and rebuilding a row per run on each of those is wasted.
  const columnIndex = useMemo<ColumnIndex>(
    () => new Map(tableColumns.map((column, index) => [column.id, index])),
    [tableColumns]
  )
  const rowIndex = useMemo<RowIndex>(
    () => new Map(runs.map((identity, index) => [runKey(identity), index])),
    [runs]
  )

  const {
    highlightRegions,
    drawHeader: drawFlashHeader,
    groupThemes,
  } = useColumnFlash(columnIndex, runs.length)

  // A spreadsheet's grid in two strengths: Glide's own line at the table's and
  // the groups' edges, and a fainter one painted everywhere else.
  const leftBorderOf = useCallback(
    (col: number) => leftBorder(col, { columns: tableColumns, pinnedCount }),
    [tableColumns, pinnedCount]
  )
  const hasVerticalBorder = useCallback(
    (col: number) => leftBorderOf(col) === 'edge',
    [leftBorderOf]
  )

  // One gray at two strengths: gray.0 over white, gray.2 over the header's
  // gray.0, and a shade darker than any selected or flashed fill.
  const innerCellLine = withAlpha(theme.colors.gray[6], 0.055)
  const innerHeaderLine = withAlpha(theme.colors.gray[6], 0.12)

  // A cell's line is blended to an opaque color, since a one-cell repaint
  // does not clear that pixel first; Glide refills the whole header every time.
  const drawCell = useCallback<DrawCellCallback>(
    (args, drawContent) => {
      drawContent()

      // Glide hands this callback its renderers' draw args, fill included,
      // though the callback's type leaves the fill out.
      const { ctx, rect, col, cellFillColor } = args as BaseDrawArgs
      if (leftBorderOf(col) === 'inner') {
        // A selected row's fill arrives translucent, painted over the cell's own.
        const fill = blend(cellFillColor, args.theme.bgCell)
        paintInnerLine(ctx, { rect, color: blend(innerCellLine, fill) })
      }
    },
    [leftBorderOf, innerCellLine]
  )
  const drawHeader = useCallback<DrawHeaderCallback>(
    (args, drawContent) => {
      if (drawFlashHeader) {
        drawFlashHeader(args, drawContent)
      } else {
        drawContent()
      }

      if (leftBorderOf(args.columnIndex) === 'inner') {
        paintInnerLine(args.ctx, { rect: args.rect, color: innerHeaderLine })
      }
    },
    [drawFlashHeader, leftBorderOf, innerHeaderLine]
  )

  // Glide would paint the raw group key, and it asks per visible column on every
  // paint, so the labels resolve once here. `''` is an ungrouped column.
  const groupDetails = useMemo(() => {
    const details: Record<
      string,
      { name: string; overrideTheme?: Partial<Theme> }
    > = { '': { name: '' } }
    for (const name of Object.keys(groups)) {
      details[name] = {
        name: getGroupTitle(name, groups),
        overrideTheme: groupThemes?.[name],
      }
    }

    return details
  }, [groups, groupThemes])

  // Glide reads each band's theme from here, but a new identity alone repaints
  // nothing; the flash's new highlightRegions each frame does that.
  const getGroupDetails = useCallback(
    (group: string) => groupDetails[group] ?? { name: group },
    [groupDetails]
  )

  const gridSelection = useMemo<GridSelection>(() => {
    let columns = CompactSelection.empty()
    for (const variable of selectedColumns) {
      const index = columnIndex.get(variable)
      if (index != null) {
        columns = columns.add(index)
      }
    }

    // The highlight follows the selected run rather than the row it sat on, so
    // a run arriving above it cannot slide it onto its neighbor.
    let rows = CompactSelection.empty()
    for (const key of Object.keys(rowSelection)) {
      const index = rowIndex.get(key)
      if (index != null) {
        rows = rows.add(index)
      }
    }

    return {
      columns,
      rows,
      current: toCurrent(selectedCells, columnIndex, rowIndex),
    }
  }, [columnIndex, rowIndex, selectedColumns, rowSelection, selectedCells])

  // Highlight the row of the current cell in Glide's selected-row tint, without
  // selecting the run (which would open the aside).
  const focusedRow = gridSelection.current?.cell[1]
  const focusedRowTheme = useMemo<Partial<Theme>>(
    () => ({ bgCell: blend(getDefaultTheme().accentLight, theme.white) }),
    [theme]
  )
  const getRowThemeOverride = useCallback(
    (row: number) =>
      row === focusedRow && !gridSelection.rows.hasIndex(row)
        ? focusedRowTheme
        : undefined,
    [focusedRow, focusedRowTheme, gridSelection.rows]
  )

  const handleGridSelectionChange = (newSelection: GridSelection) => {
    const { columns, current } = newSelection

    const nextRun = toSelectedRun(newSelection, {
      runs,
      selectedRun,
      keyPressed: keyPressed.current,
      pointerOnHeader: pointerOnHeader.current,
    })
    if (nextRun == null) {
      if (selectedRun) {
        dispatch(runDeselected())
      }
    } else if (selectedRun == null || runKey(nextRun) !== runKey(selectedRun)) {
      dispatch(runSelected(nextRun))
    }

    // If the aside is open and a key moved the current cell, update the aside
    // the same way a click does.
    const movedTo = current?.cell
    if (
      keyPressed.current &&
      selectedRun != null &&
      movedTo != null &&
      !isEqual(movedTo, gridSelection.current?.cell)
    ) {
      handleCellActivated(movedTo)
    }

    // Clear range stack if cells from the other column are currently selected
    const rangeStack =
      current && !isEmpty(current.cell) && !isEmpty(current.rangeStack)
        ? current.cell[0] !== current.rangeStack[0].x
          ? []
          : current.rangeStack.filter(
              (range) => !isEqual(current.cell, [range.x, range.y])
            )
        : undefined

    dispatch(
      gridSelectionChanged({
        columns: columns
          .toArray()
          .map((index) => tableColumns[index]?.id)
          .filter((variable) => variable != null),
        cells: current
          ? toSelectedCells(
              { ...current, ...(rangeStack && { rangeStack }) },
              tableColumns,
              runs
            )
          : null,
      })
    )
  }

  const handleCellActivated = (item: Item) => {
    const cell = toCellId(item)
    if (cell) {
      onCellActivated(cell)
    }
  }

  // If the aside is open, a plain click activates the cell, so the aside shows
  // the clicked cell. The row marker (column -1) is handled by the grid
  // selection instead. Ctrl/Cmd-clicks add to the cell selection and
  // Shift-clicks leave it unchanged, so neither should move the aside.
  const handleCellClicked = (item: Item, event: CellClickedEventArgs) => {
    if (
      selectedRun == null ||
      item[0] < 0 ||
      event.button !== 0 ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return
    }

    handleCellActivated(item)
  }

  const handleCellContextMenu = (
    [col, row]: Item,
    event: CellClickedEventArgs
  ) => {
    event.preventDefault()

    // As in the header menu, the run selection is left alone: right-clicking
    // opens a menu, it does not close the aside.
    let selectedCell = gridSelection.current?.cell ?? []
    let selectedRange = gridSelection.current?.rangeStack ?? []

    if (
      !isEqual(selectedCell, [col, row]) &&
      !selectedRange.some((rect) => rect.x === col && rect.y === row)
    ) {
      selectedCell = [col, row]
      selectedRange = []

      dispatch(
        gridSelectionChanged({
          columns: [],
          cells: toSelectedCells(
            {
              cell: selectedCell,
              rangeStack: selectedRange,
              range: { x: col, y: row, width: 1, height: 1 },
            },
            tableColumns,
            runs
          ),
        })
      )
    }

    const cell = toCellId([col, row])
    if (!cell) {
      return
    }

    const selectedRows = [
      selectedCell[1],
      ...selectedRange.map((rect) => rect.y),
    ]
    onCellContextMenu({
      ...cell,
      selectedRuns: selectedRows
        .map((index) => (index == null ? undefined : runs[index]))
        .filter((selected) => selected != null),
      position: toClientPoint(event),
    })
  }
  const handleHeaderContextMenu = (
    col: number,
    event: HeaderClickedEventArgs
  ) => {
    event.preventDefault()

    // The row-marker header arrives as -1. Glide guards the group bar against
    // it but not this one, and it has nothing to select or plot.
    const column = tableColumns[col]
    if (col < 0 || !column) {
      return
    }

    // Right-clicking outside the selection replaces it, so the menu reads the
    // selection it is about to show rather than the one it is replacing. The
    // run selection is left alone: it says which run the aside is showing, and
    // opening a menu is not a reason to close that.
    const isSelected = gridSelection.columns.hasIndex(col)
    if (!isSelected) {
      dispatch(gridSelectionChanged({ columns: [column.id], cells: null }))
    }

    const columnSelection = isSelected ? gridSelection.columns.toArray() : [col]
    onHeaderContextMenu({
      variable: column.id,
      selectedVariables: columnSelection
        .map((index) => tableColumns[index]?.id)
        .filter((variable) => variable != null),
      position: toClientPoint(event),
    })
  }

  const lastVisibleRegionRef = useRef<{
    rect: Rectangle
    tx: number
    ty: number
  } | null>(null)
  const handleVisibleRegionChange = useCallback(
    (rect: Rectangle, tx?: number, ty?: number) => {
      onVisibleRegionChanged(rect)
      scrollToViewHandler(rect)

      const previous = lastVisibleRegionRef.current
      const nextTx = tx ?? 0
      const nextTy = ty ?? 0
      // tx/ty catch sub-cell smooth-scroll where rect.x/y stay unchanged.
      const scrolled =
        !previous ||
        previous.rect.x !== rect.x ||
        previous.rect.y !== rect.y ||
        previous.tx !== nextTx ||
        previous.ty !== nextTy
      lastVisibleRegionRef.current = { rect, tx: nextTx, ty: nextTy }

      // The rehover waits a frame, so whatever onScroll closed has gone by
      // then and the mousemove reaches the grid.
      if (scrolled) {
        onScroll()
        rehoverAtCursor()
      }
    },
    [onVisibleRegionChanged, scrollToViewHandler, onScroll, rehoverAtCursor]
  )

  return (
    <DataEditorCore
      ref={tableRef}
      theme={gridTheme}
      columns={gridColumns}
      highlightRegions={highlightRegions}
      drawHeader={drawHeader}
      getRowThemeOverride={getRowThemeOverride}
      drawCell={drawCell}
      getGroupDetails={getGroupDetails}
      rowHeight={ROW_HEIGHT}
      headerHeight={HEADER_HEIGHT}
      groupHeaderHeight={GROUP_HEADER_HEIGHT}
      verticalBorder={hasVerticalBorder}
      onGroupHeaderClicked={handleGroupHeaderClicked}
      // Glide suppresses the native menu only when a consumer asks it
      // to, and the group bar has nothing of its own to offer.
      onGroupHeaderContextMenu={(_col, event) => event.preventDefault()}
      getCellContent={getContent}
      onColumnResize={onColumnResize}
      onColumnResizeStart={onColumnResizeStart}
      onColumnResizeEnd={onColumnResizeEnd}
      // Lets Glide measure the visible cells, which is what its
      // built-in double-click fit needs.
      getCellsForSelection={true}
      // Copy rides along with the line above, and a column copy asks for
      // every run, which pagination has not fetched, so a paste is short.
      keybindings={{ copy: false }}
      // No cell here sets a span, so Glide's scan for one would read
      // cells on every selection change and throw the answer away.
      spanRangeBehavior="allowPartial"
      rows={runs.length}
      rowSelect="single"
      rowMarkers={rowMarkers}
      gridSelection={gridSelection}
      onGridSelectionChange={handleGridSelectionChange}
      // Escape or a click on nothing, which unselecting a column is not.
      onSelectionCleared={() => dispatch(runDeselected())}
      onCellClicked={handleCellClicked}
      onCellActivated={handleCellActivated}
      rangeSelect="multi-cell"
      onCellContextMenu={handleCellContextMenu}
      onHeaderContextMenu={handleHeaderContextMenu}
      onItemHovered={handleGridItemHovered}
      onMouseMove={handleGridMouseMove}
      onKeyDown={handleGridKeyDown}
      freezeColumns={pinnedCount}
      renderers={GRID_RENDERERS}
      customRenderers={renderers}
      headerIcons={sprites}
      imageWindowLoader={imageWindowLoader}
      onVisibleRegionChanged={handleVisibleRegionChange}
      scrollOffsetX={scrollX}
      scrollOffsetY={scrollY}
    />
  )
}

export default forwardRef(GlideGrid)
