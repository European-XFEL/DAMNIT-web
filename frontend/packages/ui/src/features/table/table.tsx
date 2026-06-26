import { useCallback, useMemo, useRef, useState } from 'react'
import {
  CompactSelection,
  DataEditor,
  type CellClickedEventArgs,
  type DataEditorProps,
  type DataEditorRef,
  GridCellKind,
  type GridSelection,
  type HeaderClickedEventArgs,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid'
import { allCells } from '@glideapps/glide-data-grid-cells'
import { Group, Stack } from '@mantine/core'
import { type IBounds, useLayer } from 'react-laag'

import {
  errorCell,
  errorCellRenderer,
  getCell,
  numberCell,
  textCell,
} from './cells'
import { TagsPopover } from './components/popovers/tags-popover'
import { VariablesPopover } from './components/popovers/variables-popover'
import ContextMenu from './context-menu'
import { useErrorTooltip } from './hooks/use-error-tooltip'
import { useTable } from './hooks/use-table'
import {
  ImagePreviewTooltip,
  type ImagePreviewTooltipState,
} from './image-preview-tooltip'
import { useContextMenu } from './use-context-menu'
import { usePagination } from './use-pagination'
import { useScrollToView } from './use-scroll-to-view'
import { selectRun } from './table.slice'
import { canPlotData } from '../plots/utils'
import { addPlot } from '../plots/plots.slice'

import { EXCLUDED_VARIABLES, VARIABLES } from '../../constants'
import { getExtractedValue } from '../../data/extracted'
import { getTableData } from '../../data/table'
import { useAppDispatch, useAppSelector } from '../../redux/hooks'
import { isArrayEqual, sorted } from '../../utils/array'
import { isEmpty } from '../../utils/helpers'

const CUSTOM_RENDERERS = [...allCells, errorCellRenderer]

type Column = {
  id: string
  title: string
}

const formatColumns = (columns: Column[]) => {
  return columns.map((column) => ({
    ...column,
    width: 100,
  }))
}

const ZERO_BOUNDS: IBounds = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  right: 0,
  bottom: 0,
}

const getLayerBounds = (bounds: Rectangle): IBounds => {
  return {
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    right: bounds.x + bounds.width,
    bottom: bounds.y + bounds.height,
  }
}

export type TableProps = {
  grid?: DataEditorProps
  paginated?: boolean
}

const Table = ({ grid, paginated = true }: TableProps) => {
  // Initialization: References
  const tableRef = useRef<DataEditorRef>(null)

  // Initialization: Selectors
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const {
    data: tableData,
    metadata: tableMetadata,
    lastUpdate: tableLastUpdate,
  } = useAppSelector((state) => state.tableData)

  // Initialization: Hooks
  const dispatch = useAppDispatch()
  const { onVisibleRegionChanged: paginationHandler } = usePagination({
    proposal,
    enabled: paginated,
  })
  const {
    onVisibleRegionChanged: scrollToViewHandler,
    scrollX,
    scrollY,
  } = useScrollToView(tableRef)
  const [contextMenu, setContextMenu] = useContextMenu()
  const { columnVisibility } = useTable()
  const gridOnItemHovered = grid?.onItemHovered
  const [imagePreview, setImagePreview] =
    useState<ImagePreviewTooltipState | null>(null)
  const imagePreviewTrigger = useMemo(
    () => ({ getBounds: () => imagePreview?.bounds ?? ZERO_BOUNDS }),
    [imagePreview]
  )
  const {
    renderLayer: renderImagePreviewLayer,
    layerProps: imagePreviewLayerProps,
    arrowProps: imagePreviewArrowProps,
  } = useLayer({
    isOpen: imagePreview !== null,
    placement: 'right-start',
    possiblePlacements: ['right-start', 'left-start', 'right-end', 'left-end'],
    auto: true,
    triggerOffset: 8,
    container: 'portal',
    trigger: imagePreviewTrigger,
  })

  // Initialization: Memos
  const tableColumns = useMemo(
    () =>
      Object.values(tableMetadata.variables)
        .filter(
          ({ name }) =>
            !EXCLUDED_VARIABLES.includes(name) &&
            columnVisibility[name] !== false
        )
        .map(({ name, title }) => ({ id: name, title: title || name })),
    [tableMetadata.variables, columnVisibility]
  )

  // Data: Populate grid
  const getContent = useCallback(
    ([col, row]: Item) => {
      const run = tableMetadata.runs[row]
      const variable = tableColumns[col]?.id

      if (variable === VARIABLES.run) {
        return numberCell(run)
      }

      const rowData = tableData[run]
      if (!rowData || !rowData[variable]) {
        return textCell('')
      }

      const cellError = rowData[variable].error
      if (cellError) {
        return errorCell(cellError)
      }

      return getCell({
        value: rowData[variable].value,
        dtype: rowData[variable].dtype,
        options: { lastUpdated: tableLastUpdate[run] },
      })
    },
    [tableColumns, tableMetadata.runs, tableData, tableLastUpdate]
  )

  // Cell: Error tooltip (shown when hovering an errored variable's cell).
  const lookupError = useCallback(
    (col: number, row: number) => {
      const run = tableMetadata.runs[row]
      const variable = tableColumns[col]?.id
      return run != null && variable
        ? tableData[run]?.[variable]?.error
        : undefined
    },
    [tableColumns, tableMetadata.runs, tableData]
  )
  const {
    onItemHovered: handleErrorItemHovered,
    dismissOnScroll: dismissErrorTooltipOnScroll,
    tooltip: errorTooltip,
  } = useErrorTooltip(lookupError)

  // Cell: Click event
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: undefined,
  })
  const handleGridSelectionChange = (newSelection: GridSelection) => {
    const { columns, rows, current } = newSelection

    // Inform that a row has been (de)selected
    const row = rows.last() as number
    const run = tableMetadata.runs[row]

    dispatch(
      selectRun({
        run,
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
    const run = tableMetadata.runs[row]

    dispatch(
      selectRun({
        run: run,
        variables: col == null ? null : [tableColumns[col].id],
      })
    )
  }
  const handleItemHovered: NonNullable<DataEditorProps['onItemHovered']> =
    useCallback(
      (event) => {
        gridOnItemHovered?.(event)
        handleErrorItemHovered(event)

        if (event.kind !== 'cell') {
          setImagePreview(null)
          return
        }

        const [col, row] = event.location
        if (col < 0 || row < 0) {
          setImagePreview(null)
          return
        }

        const cell = getContent(event.location)
        if (cell.kind !== GridCellKind.Image || !cell.data[0]) {
          setImagePreview(null)
          return
        }

        const nextPreview = {
          src: cell.data[0],
          bounds: getLayerBounds(event.bounds),
        }

        setImagePreview((current) =>
          current?.src === nextPreview.src &&
          current.bounds.left === nextPreview.bounds.left &&
          current.bounds.top === nextPreview.bounds.top
            ? current
            : nextPreview
        )
      },
      [getContent, gridOnItemHovered, handleErrorItemHovered]
    )

  // Context menus
  const handleCellContextMenu = (
    [col, row]: Item,
    event: CellClickedEventArgs
  ) => {
    event.preventDefault()
    setImagePreview(null)

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
    const rowData = tableData[tableMetadata.runs[row]]

    if (
      col !== -1 &&
      canPlotData(rowData[column]?.value, rowData[column]?.dtype)
    ) {
      const variable = tableColumns[col]
      const subtitle = `${variable.title}`

      const rows = [selectedCell[1], ...selectedRange.map((rect) => rect.y)]
      const runs = sorted(rows.map((row) => tableMetadata.runs[row as number]))

      setContextMenu({
        localPosition: { x: event.localEventX, y: event.localEventY },
        bounds: event.bounds,
        contents: [
          {
            key: 'plot',
            title: 'Plot: data',
            subtitle,
            onClick: () =>
              addDataPlot({ variable: variable.id, label: subtitle, runs }),
          },
        ],
      })
    }
  }
  const handleHeaderContextMenu = (
    col: number,
    event: HeaderClickedEventArgs
  ) => {
    event.preventDefault()
    const columnSelection = gridSelection.columns.toArray()

    if (!columnSelection.includes(col)) {
      if (!columnSelection.length) {
        columnSelection.push(col)
      }

      setGridSelection({
        columns: CompactSelection.fromSingleSelection(col),
        rows: CompactSelection.empty(),
        current: undefined,
      })
    }

    if (columnSelection.length === 1) {
      if (col !== -1) {
        const variable = tableColumns[col]
        const subtitle = `${variable.title} vs. Run`

        setContextMenu({
          localPosition: { x: event.localEventX, y: event.localEventY },
          bounds: event.bounds,
          contents: [
            {
              key: 'plot',
              title: 'Plot: summary',
              subtitle,
              onClick: () =>
                addSummaryPlot({
                  variables: [VARIABLES.run, variable.id],
                  label: subtitle,
                }),
            },
          ],
        })
      }
    } else if (columnSelection.length === 2) {
      const col0 = columnSelection.filter((c) => c !== col)[0]
      const y = tableColumns[col] // the latest selection
      const x = tableColumns[col0] // the first selection

      const subtitle = `${y.title} vs. ${x.title}`

      setContextMenu({
        localPosition: { x: event.localEventX, y: event.localEventY },
        bounds: event.bounds,
        contents: [
          {
            key: 'plot',
            title: 'Plot: summary',
            subtitle,
            onClick: () =>
              addSummaryPlot({ variables: [x.id, y.id], label: subtitle }),
          },
        ],
      })
    }
  }

  const addSummaryPlot = ({
    variables,
    label,
  }: {
    variables: string[]
    label: string
  }) => {
    dispatch(
      addPlot({
        variables,
        source: 'table',
        title: `Summary: ${label}`,
      })
    )

    dispatch(
      getTableData({
        proposal,
        variables,
      })
    )
  }

  const addDataPlot = ({
    variable,
    label,
    runs,
  }: {
    variable: string
    label: string
    runs: string[]
  }) => {
    dispatch(
      addPlot({
        runs,
        variables: [variable],
        source: 'extracted',
        title: `Data: ${label}`,
      })
    )
    runs.forEach((run) => {
      dispatch(getExtractedValue({ proposal, run, variable }))
    })
  }

  const lastVisibleRegionRef = useRef<{
    rect: Rectangle
    tx: number
    ty: number
  } | null>(null)
  const handleVisibleRegionChange = useCallback(
    (rect: Rectangle, tx?: number, ty?: number) => {
      paginationHandler(rect)
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
        dismissErrorTooltipOnScroll()
        setImagePreview(null)
      }
    },
    [paginationHandler, scrollToViewHandler, dismissErrorTooltipOnScroll]
  )
  const imagePreviewTooltip = imagePreview
    ? renderImagePreviewLayer(
        <ImagePreviewTooltip
          src={imagePreview.src}
          layerProps={imagePreviewLayerProps}
          arrowProps={imagePreviewArrowProps}
        />
      )
    : null

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
              columns={formatColumns(tableColumns)}
              getCellContent={getContent}
              rows={tableMetadata.runs.length}
              rowSelect="single"
              rowMarkers="clickable-number"
              gridSelection={gridSelection}
              onGridSelectionChange={handleGridSelectionChange}
              onCellActivated={handleCellActivated}
              rangeSelect="multi-cell"
              onCellContextMenu={handleCellContextMenu}
              onHeaderContextMenu={handleHeaderContextMenu}
              onItemHovered={handleItemHovered}
              freezeColumns={1}
              customRenderers={CUSTOM_RENDERERS}
              onVisibleRegionChanged={handleVisibleRegionChange}
              scrollOffsetX={scrollX}
              scrollOffsetY={scrollY}
            />
            {errorTooltip}
            {imagePreviewTooltip}
            <ContextMenu {...contextMenu} />
            <div id="portal" />
          </>
        </Stack>
      )}
    </>
  )
}

export default Table
