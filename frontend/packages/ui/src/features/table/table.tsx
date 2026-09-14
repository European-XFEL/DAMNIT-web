import { useCallback, useMemo, useRef, useState } from 'react'
import {
  CompactSelection,
  DataEditor,
  type CellClickedEventArgs,
  type DataEditorProps,
  type DataEditorRef,
  type GridSelection,
  type GroupHeaderClickedEventArgs,
  type HeaderClickedEventArgs,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid'
import { Stack, useMantineTheme } from '@mantine/core'

import { DTYPES, VARIABLES } from '#src/constants'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { hasValue, runKey } from '#src/data/table/table-data.transforms'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { isArrayEqual, sorted } from '#src/utils/array'
import { isEmpty } from '#src/utils/helpers'
import {
  errorCell,
  getCell,
  makeCellRenderers,
  numberCell,
  textCell,
  type ErrorColors,
} from '#src/features/table/utils/cells'
import {
  getColumnTitle,
  getGroupTitle,
} from '#src/features/table/utils/column-title'
import { TableToolbar } from '#src/features/table/components/table-toolbar'
import { type CellTooltip } from '#src/features/table/components/tooltips/table-tooltip'
import ContextMenu from '#src/features/table/components/context-menu'
import { useTableTooltip } from '#src/features/table/hooks/use-table-tooltip'
import { useTableColumns } from '#src/features/table/hooks/use-table-columns'
import { useTableRuns } from '#src/features/table/hooks/use-table-runs'
import { useContextMenu } from '#src/features/table/hooks/use-context-menu'
import { useScrollToView } from '#src/features/table/hooks/use-scroll-to-view'
import { useColumnResize } from '#src/features/table/hooks/use-column-resize'
import {
  toCurrent,
  toSelectedCells,
  type ColumnIndex,
  type RowIndex,
  type SelectedCells,
} from '#src/features/table/utils/grid-selection'
import { selectRowSelection } from '#src/features/table/stores/table.selectors'
import {
  cellActivated,
  plotRequested,
  runDeselected,
  runSelected,
} from '#src/features/table/stores/table.slice'

export type TableProps = {
  grid?: DataEditorProps
  paginated?: boolean
}

const PAGE_SIZE = 10

// Shorter than the 36px title row below it: Glide paints both rows in the same
// font on the same background, so height is the only lever left.
const GROUP_HEADER_HEIGHT = 24

// Every column starts here, whatever it holds. Dragging a header edge or
// double-clicking it writes the user's own width to the store instead.
const DEFAULT_COLUMN_WIDTH = 100

const Table = ({ grid, paginated = true }: TableProps) => {
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
  } = useColumnResize(tableRef, tableColumns.length)
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

  // Glide's own default would paint the raw group key, so the label comes here.
  // It asks once per visible column on every paint, so resolve the labels once
  // and hand them back by lookup. `''` is what it passes for an ungrouped one.
  const groupDetails = useMemo(() => {
    const details: Record<string, { name: string }> = { '': { name: '' } }
    for (const name of Object.keys(groups)) {
      details[name] = { name: getGroupTitle(name, groups) }
    }
    return details
  }, [groups])

  // Glide redraws the canvas whenever this changes identity, so keep it stable.
  const getGroupDetails = useCallback(
    (group: string) => groupDetails[group] ?? { name: group },
    [groupDetails]
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
  // the outline a drill-down draws is gone after the Plots tab unmounts the
  // table, while the drill-down itself survives in `activeVariable`: the aside
  // keeps showing the right variable, only its outline has to be clicked back.
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [selectedCells, setSelectedCells] = useState<SelectedCells>()
  const rowSelection = useAppSelector(selectRowSelection)

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
    const { columns, rows, current } = newSelection

    // Inform that a row has been (de)selected. The proposal rides along: run
    // numbers collide across proposals in one table, so the number alone cannot
    // identify which run the detail aside should read.
    const row = rows.last() as number
    const identity = runs[row]

    dispatch(identity ? runSelected(identity) : runDeselected())

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
  const handleCellActivated = ([col, row]: Item) => {
    const identity = runs[row]
    const variable = tableColumns[col]?.id
    if (!identity || !variable) {
      return
    }

    dispatch(cellActivated({ ...identity, variable }))
  }

  // Context menus. Every one of them is a single plot entry placed at the
  // pointer, so they differ only in what that entry says and does.
  const showPlotMenu = (
    event: CellClickedEventArgs | HeaderClickedEventArgs,
    item: { title: string; subtitle: string; onClick: () => void }
  ) => {
    setContextMenu({
      localPosition: { x: event.localEventX, y: event.localEventY },
      bounds: event.bounds,
      contents: [{ key: 'plot', ...item }],
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
        title: 'Plot: preview',
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
      title: 'Plot: summary',
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
        title: `Summary: ${label}`,
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
        title: `Preview: ${label}`,
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
        <Stack w="100%" h="100%" gap="sm">
          <TableToolbar
            onFitAllColumns={fitAllColumns}
            onResetColumnWidths={resetColumnWidths}
          />
          <>
            <DataEditor
              {...(grid || {})}
              ref={tableRef}
              columns={gridColumns}
              getGroupDetails={getGroupDetails}
              groupHeaderHeight={GROUP_HEADER_HEIGHT}
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
              rowMarkers="clickable-number"
              gridSelection={gridSelection}
              onGridSelectionChange={handleGridSelectionChange}
              onCellActivated={handleCellActivated}
              rangeSelect="multi-cell"
              onCellContextMenu={handleCellContextMenu}
              onHeaderContextMenu={handleHeaderContextMenu}
              onItemHovered={handleItemHovered}
              freezeColumns={pinnedCount}
              customRenderers={renderers}
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
