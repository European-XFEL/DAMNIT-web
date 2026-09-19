import { useCallback, useMemo, useRef, useState } from 'react'
import {
  blend,
  CompactSelection,
  DataEditorCore,
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
import { Stack, useMantineTheme } from '@mantine/core'

import { DTYPES, VARIABLES } from '#src/constants'
import { plotRequested } from '#src/app/store/actions'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { hasValue, runKey } from '#src/data/table/table-data.transforms'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { isArrayEqual, sorted } from '#src/utils/array'
import { isEmpty } from '#src/utils/helpers'
import { FONT_FAMILY_SANS, FONT_SIZE_DATA, FONT_SIZES } from '#src/styles/fonts'
import { type PlotSource } from '#src/types'
import {
  errorCell,
  getCell,
  GRID_RENDERERS,
  makeCellRenderers,
  numberCell,
  textCell,
  type ErrorColors,
} from '#src/features/table/utils/cells'
import { getColumnTitle, getGroupTitle } from '#src/data/table/column-title'
import { leftBorder } from '#src/features/table/utils/column-lines'
import { DEFAULT_COLUMN_WIDTH } from '#src/features/table/utils/column-widths'
import { TableToolbar } from '#src/features/table/components/table-toolbar'
import { type CellTooltip } from '#src/features/table/components/tooltips/table-tooltip'
import ContextMenu from '#src/features/table/components/context-menu'
import { useTableTooltip } from '#src/features/table/hooks/use-table-tooltip'
import { useTableColumns } from '#src/features/table/hooks/use-table-columns'
import { useTableRuns } from '#src/features/table/hooks/use-table-runs'
import { useContextMenu } from '#src/features/table/hooks/use-context-menu'
import { useScrollToView } from '#src/features/table/hooks/use-scroll-to-view'
import { useColumnResize } from '#src/features/table/hooks/use-column-resize'
import { useColumnFlash } from '#src/features/table/hooks/use-column-flash'
import {
  runSelectionChange,
  toCurrent,
  toSelectedCells,
  type ColumnIndex,
  type RowIndex,
  type SelectedCells,
} from '#src/features/table/utils/grid-selection'
import { selectRowSelection } from '#src/features/table/stores/table.selectors'
import {
  cellActivated,
  runDeselected,
  runSelected,
} from '#src/features/table/stores/table.slice'

export type TableProps = {
  paginated?: boolean
}

const PAGE_SIZE = 10

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

const Table = ({ paginated = true }: TableProps) => {
  // Initialization: References
  const tableRef = useRef<DataEditorRef>(null)

  // Initialization: Data sources (the Apollo cache, via hooks)
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { runs, groups } = useTableMeta()
  const {
    cellsByKey,
    lastUpdatedByKey,
    onVisibleRegionChanged: fetchOnScroll,
  } = useTableRuns({
    proposal,
    paginated,
    pageSize: PAGE_SIZE,
  })

  // Initialization: Hooks
  const dispatch = useAppDispatch()
  const {
    onVisibleRegionChanged: scrollToViewHandler,
    scrollX,
    scrollY,
  } = useScrollToView(tableRef)
  const [contextMenu, setContextMenu] = useContextMenu()
  const { columns: tableColumns, pinnedCount } = useTableColumns()
  const {
    columnSizing,
    onColumnResize,
    onColumnResizeStart,
    onColumnResizeEnd,
    fitAllColumns,
    resetColumnWidths,
  } = useColumnResize(tableRef, tableColumns)
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
  const errorColors = useMemo<ErrorColors>(
    () => ({
      error: theme.colors.red[6],
      missing: theme.colors.gray[5],
      skipped: theme.colors.gray[5],
    }),
    [theme]
  )
  const renderers = useMemo(
    () => makeCellRenderers(errorColors, DEFAULT_COLUMN_WIDTH),
    [errorColors]
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
  // header's grey here, and the index reads in the secondary grey.
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

  // Data: Populate grid. Row layout is the server-ordered run list; a cell's
  // value is looked up by the run's identity from the normalized cache.
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
      const cell = cellsByKey.get(key)?.[variable]
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

  // Cell: tooltip. Errored cells show a card; image cells show a preview.
  const resolveTooltip = useCallback(
    (col: number, row: number): CellTooltip | undefined => {
      const identity = runs[row]
      const variable = tableColumns[col]?.id
      if (identity == null || !variable) {
        return undefined
      }
      const item = cellsByKey.get(runKey(identity))?.[variable]
      if (!item) {
        return undefined
      }
      if (item.error) {
        return { kind: 'error', error: item.error }
      }
      if (
        item.summary.dtype === DTYPES.image &&
        typeof item.summary.value === 'string' &&
        item.summary.value
      ) {
        return { kind: 'image', src: item.summary.value }
      }
      return undefined
    },
    [tableColumns, runs, cellsByKey]
  )
  const {
    onItemHovered: handleItemHovered,
    dismissOnScroll: dismissTooltipOnScroll,
    tooltip,
  } = useTableTooltip(resolveTooltip, { suppressed: contextMenu.isOpen })

  // Cell: Click event
  // Both stay local because nothing outside the grid reads them. That does mean
  // the outline a drill-down draws is gone after another view unmounts the
  // table, while the drill-down itself survives in `activeVariable`: the aside
  // keeps showing the right variable, only its outline has to be clicked back.
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [selectedCells, setSelectedCells] = useState<SelectedCells>()
  const rowSelection = useAppSelector(selectRowSelection)

  // A row marker clicked off and the last column unselected reach Glide's
  // change handler as the same empty selection; only the header takes Ctrl/Cmd.
  const pointerOnHeader = useRef(false)
  const handleGridItemHovered = (args: GridMouseEventArgs) => {
    pointerOnHeader.current =
      (args.kind === 'header' || args.kind === 'group-header') && !args.isTouch
    handleItemHovered(args)
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

  // One grey at two strengths: gray.0 over white, gray.2 over the header's
  // gray.0, and a shade darker than any selected or flashed fill.
  const innerCellLine = withAlpha(theme.colors.gray[6], 0.055)
  const innerHeaderLine = withAlpha(theme.colors.gray[6], 0.12)

  // A cell's line is blended to an opaque colour, since a one-cell repaint
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
    // a run arriving above it cannot slide it onto its neighbour.
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

  const handleGridSelectionChange = (newSelection: GridSelection) => {
    const { columns, current } = newSelection

    const change = runSelectionChange(newSelection, {
      runs,
      keyPressed: keyPressed.current,
      pointerOnHeader: pointerOnHeader.current,
    })
    if (change.type === 'select') {
      dispatch(runSelected(change.run))
    } else if (change.type === 'deselect') {
      dispatch(runDeselected())
    }

    // Clear range stack if cells from the other column are currently selected
    const rangeStack =
      current && !isEmpty(current.cell) && !isEmpty(current.rangeStack)
        ? current.cell[0] !== current.rangeStack[0].x
          ? []
          : current.rangeStack.filter(
              (range) => !isArrayEqual(current.cell, [range.x, range.y])
            )
        : undefined

    // Finalize
    setSelectedColumns(
      columns
        .toArray()
        .map((index) => tableColumns[index]?.id)
        .filter((variable) => variable != null)
    )
    setSelectedCells(
      current
        ? toSelectedCells(
            { ...current, ...(rangeStack && { rangeStack }) },
            tableColumns,
            runs
          )
        : undefined
    )
  }
  // The run number names the row rather than holding a value, so activating it
  // opens the whole run.
  const handleCellActivated = ([col, row]: Item) => {
    const identity = runs[row]
    const variable = tableColumns[col]?.id
    if (!identity || !variable) {
      return
    }

    dispatch(
      variable === VARIABLES.run
        ? runSelected(identity)
        : cellActivated({ ...identity, variable })
    )
  }

  // Context menus. Every one of them is a single plot entry placed at the
  // pointer, so they differ only in what that entry says and does.
  const showPlotMenu = (
    event: CellClickedEventArgs | HeaderClickedEventArgs,
    item: { kind: PlotSource; subtitle: string; onClick: () => void }
  ) => {
    setContextMenu({
      localPosition: { x: event.localEventX, y: event.localEventY },
      bounds: event.bounds,
      contents: [{ key: 'plot', title: `Plot: ${item.kind}`, ...item }],
    })
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
      !isArrayEqual(selectedCell, [col, row]) &&
      !selectedRange.some((rect) => rect.x === col && rect.y === row)
    ) {
      selectedCell = [col, row]
      selectedRange = []

      setSelectedColumns([])
      setSelectedCells(
        toSelectedCells(
          {
            cell: selectedCell,
            rangeStack: selectedRange,
            range: { x: col, y: row, width: 1, height: 1 },
          },
          tableColumns,
          runs
        )
      )
    }

    const column = tableColumns[col]?.id
    const identity = runs[row]
    const rowData = identity && cellsByKey.get(runKey(identity))

    // A row whose page has not loaded yet has no data at all, not merely no
    // value: it has nothing to offer a plot either way.
    // TODO: Use extracted data type from the database
    if (col !== -1 && hasValue(rowData ? rowData[column] : undefined)) {
      const variable = tableColumns[col]
      const subtitle = `${variable.title}`

      const selectedRows = [
        selectedCell[1],
        ...selectedRange.map((rect) => rect.y),
      ]
      const runNumbers = sorted(
        selectedRows.map((row) => String(runs[row as number]?.run))
      )

      showPlotMenu(event, {
        kind: 'preview',
        subtitle,
        onClick: () =>
          addPreviewPlot({
            variable: variable.id,
            label: subtitle,
            runs: runNumbers,
          }),
      })
    }
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
      setSelectedColumns([column.id])
      setSelectedCells(undefined)
    }

    const columnSelection = isSelected ? gridSelection.columns.toArray() : [col]

    if (columnSelection.length > 2) {
      return
    }

    // The latest selection is the y axis. The first is the x axis, or Run when
    // this column is the only one selected.
    const y = column
    const firstSelected = columnSelection.find((c) => c !== col)
    const x =
      firstSelected === undefined
        ? { id: VARIABLES.run, title: 'Run' }
        : tableColumns[firstSelected]
    const subtitle = `${y.title} vs. ${x.title}`

    showPlotMenu(event, {
      kind: 'summary',
      subtitle,
      onClick: () =>
        addSummaryPlot({ variables: [x.id, y.id], label: subtitle }),
    })
  }

  const addSummaryPlot = ({
    variables,
    label,
  }: {
    variables: string[]
    label: string
  }) => {
    dispatch(
      plotRequested({
        variables,
        source: 'summary',
        name: label,
      })
    )
  }

  const addPreviewPlot = ({
    variable,
    label,
    runs,
  }: {
    variable: string
    label: string
    runs: string[]
  }) => {
    dispatch(
      plotRequested({
        runs,
        variables: [variable],
        source: 'preview',
        name: label,
      })
    )
  }

  const lastVisibleRegionRef = useRef<{
    rect: Rectangle
    tx: number
    ty: number
  } | null>(null)
  const handleVisibleRegionChange = useCallback(
    (rect: Rectangle, tx?: number, ty?: number) => {
      fetchOnScroll(rect)
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
      if (scrolled) {
        dismissTooltipOnScroll()
      }
    },
    [fetchOnScroll, scrollToViewHandler, dismissTooltipOnScroll]
  )

  return (
    <>
      {!tableColumns.length ? null : (
        <Stack w="100%" h="100%" gap={0}>
          <TableToolbar
            onFitAllColumns={fitAllColumns}
            onResetColumnWidths={resetColumnWidths}
          />
          <>
            <DataEditorCore
              ref={tableRef}
              theme={gridTheme}
              columns={gridColumns}
              highlightRegions={highlightRegions}
              drawHeader={drawHeader}
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
              onCellActivated={handleCellActivated}
              rangeSelect="multi-cell"
              onCellContextMenu={handleCellContextMenu}
              onHeaderContextMenu={handleHeaderContextMenu}
              onItemHovered={handleGridItemHovered}
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
            {tooltip}
            <ContextMenu {...contextMenu} />
            <div id="portal" />
          </>
        </Stack>
      )}
    </>
  )
}

export default Table
