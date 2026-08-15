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
import { allCells } from '@glideapps/glide-data-grid-cells'
import { Group, Stack, useMantineTheme } from '@mantine/core'

import { DTYPES, VARIABLES } from '#src/constants'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import {
  getVariableTitle,
  hasValue,
  runKey,
} from '#src/data/table/table-data.transforms'
import { useTableMeta, useTableVariables } from '#src/data/table/use-table-meta'
import { isArrayEqual, sorted } from '#src/utils/array'
import { isEmpty } from '#src/utils/helpers'
import {
  errorCell,
  getCell,
  makeErrorCellRenderer,
  numberCell,
  textCell,
  type ErrorColors,
} from '#src/features/table/utils/cells'
import { getColumnTitle } from '#src/features/table/utils/column-title'
import { countPinnedColumns } from '#src/features/table/utils/pinned-columns'
import { TagsPopover } from '#src/features/table/components/popovers/tags-popover'
import { VariablesPopover } from '#src/features/table/components/popovers/variables-popover'
import { type CellTooltip } from '#src/features/table/components/tooltips/table-tooltip'
import ContextMenu from '#src/features/table/components/context-menu'
import { useTableTooltip } from '#src/features/table/hooks/use-table-tooltip'
import { useColumnVisibility } from '#src/features/table/hooks/use-column-visibility'
import { useTableRuns } from '#src/features/table/hooks/use-table-runs'
import { useContextMenu } from '#src/features/table/hooks/use-context-menu'
import { useScrollToView } from '#src/features/table/hooks/use-scroll-to-view'
import {
  plotRequested,
  selectRun,
} from '#src/features/table/stores/table.slice'

export type TableProps = {
  grid?: DataEditorProps
  paginated?: boolean
}

const PAGE_SIZE = 10

// Shorter than the 36px title row below it: Glide paints both rows in the same
// font on the same background, so height is the only lever left.
const GROUP_HEADER_HEIGHT = 24

const Table = ({ grid, paginated = true }: TableProps) => {
  // Initialization: References
  const tableRef = useRef<DataEditorRef>(null)

  // Initialization: Data sources (the Apollo cache, via hooks)
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { runs, groups } = useTableMeta()
  const tableVariables = useTableVariables()
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
  const columnVisibility = useColumnVisibility()
  const theme = useMantineTheme()

  // Initialization: Memos
  const tableColumns = useMemo(
    () =>
      tableVariables
        .filter(({ name }) => columnVisibility[name] !== false)
        .map((variable) => ({
          id: variable.name,
          title: getVariableTitle(variable),
          group: variable.group,
        })),
    [tableVariables, columnVisibility]
  )

  // What the grid draws: the title without the level its group header already
  // shows. Everywhere else keeps the whole title, plot labels included.
  // Glide's accessibility mirror has one header row and no group bar, so a
  // screen reader hears this stripped title with nothing to disambiguate it.
  const gridColumns = useMemo(
    () =>
      tableColumns.map((column) => ({
        ...column,
        title: getColumnTitle(column, groups),
        width: 100,
      })),
    [tableColumns, groups]
  )

  const pinnedColumns = useMemo(
    () => countPinnedColumns(tableColumns),
    [tableColumns]
  )

  // Glide's own default would paint the raw group key, so the label comes here;
  // a group whose title the server could not derive keeps that key. It asks once
  // per visible column on every paint, so resolve the labels once and hand them
  // back by lookup. `''` is what it passes for an ungrouped one.
  const groupDetails = useMemo(() => {
    const details: Record<string, { name: string }> = { '': { name: '' } }
    for (const name of Object.keys(groups)) {
      details[name] = { name: groups[name]?.title ?? name }
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
    () => [...allCells, makeErrorCellRenderer(errorColors)],
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
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: undefined,
  })
  const handleGridSelectionChange = (newSelection: GridSelection) => {
    const { columns, rows, current } = newSelection

    // Inform that a row has been (de)selected. The proposal rides along: run
    // numbers collide across proposals in one table, so the number alone cannot
    // identify which run the detail aside should read.
    const row = rows.last() as number
    const identity = runs[row]

    dispatch(
      selectRun({
        proposal: identity?.proposal ?? null,
        run: identity?.run ?? null,
      })
    )

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
    setGridSelection({
      columns,
      rows,

      current: current
        ? { ...current, ...(rangeStack && { rangeStack }) }
        : undefined,
    })
  }
  const handleCellActivated = (cell: Item) => {
    const [col, row] = cell
    const identity = runs[row]

    dispatch(
      selectRun({
        proposal: identity?.proposal ?? null,
        run: identity?.run ?? null,
        variables: col == null ? null : [tableColumns[col].id],
      })
    )
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

    let selectedCell = gridSelection.current?.cell ?? []
    let selectedRange = gridSelection.current?.rangeStack ?? []

    if (
      !isArrayEqual(selectedCell, [col, row]) &&
      !selectedRange.some((rect) => rect.x === col && rect.y === row)
    ) {
      selectedCell = [col, row]
      selectedRange = []

      setGridSelection({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: selectedCell,
          rangeStack: selectedRange,

          range: { x: col, y: row, width: 1, height: 1 },
        },
      })
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
    if (col < 0) {
      return
    }

    // Right-clicking outside the selection replaces it, so the menu reads the
    // selection it is about to show rather than the one it is replacing.
    const isSelected = gridSelection.columns.hasIndex(col)
    if (!isSelected) {
      setGridSelection({
        columns: CompactSelection.fromSingleSelection(col),
        rows: CompactSelection.empty(),
        current: undefined,
      })
    }

    const columnSelection = isSelected ? gridSelection.columns.toArray() : [col]

    if (columnSelection.length > 2) {
      return
    }

    // The latest selection is the y axis. The first is the x axis, or Run when
    // this column is the only one selected.
    const y = tableColumns[col]
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
          <Group px={6}>
            <VariablesPopover />
            <TagsPopover />
          </Group>
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
              freezeColumns={pinnedColumns}
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
