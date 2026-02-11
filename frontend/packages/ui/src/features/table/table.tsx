import { useCallback, useMemo, useRef, useState } from 'react'
import {
  CompactSelection,
  DataEditor,
  type CellClickedEventArgs,
  type DataEditorProps,
  type DataEditorRef,
  type GridSelection,
  type HeaderClickedEventArgs,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid'
import { allCells } from '@glideapps/glide-data-grid-cells'
import { Group, Stack } from '@mantine/core'

import { getCell, numberCell, textCell } from './cells'
import { TagsPopover } from './components/popovers/tags-popover'
import { VariablesPopover } from './components/popovers/variables-popover'
import ContextMenu from './context-menu'
import { useVariableSettings } from './hooks/use-variable-settings'
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
  const { visibility: variableVisibility } = useVariableSettings()

  // Initialization: Memos
  const tableColumns = useMemo(
    () =>
      Object.values(tableMetadata.variables)
        .filter(
          ({ name }) =>
            !EXCLUDED_VARIABLES.includes(name) &&
            variableVisibility[name] !== false
        )
        .map(({ name, title }) => ({ id: name, title: title || name })),
    [tableMetadata.variables, variableVisibility]
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

      return getCell({
        value: rowData[variable].value,
        dtype: rowData[variable].dtype,
        options: { lastUpdated: tableLastUpdate[run] },
      })
    },
    [tableColumns, tableMetadata.runs, tableData, tableLastUpdate]
  )

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

  // Context menus
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

  const handleVisibleRegionchange = useCallback(
    (rect: Rectangle) => {
      paginationHandler(rect)
      scrollToViewHandler(rect)
    },
    [paginationHandler, scrollToViewHandler]
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
              freezeColumns={1}
              customRenderers={allCells}
              onVisibleRegionChanged={handleVisibleRegionchange}
              scrollOffsetX={scrollX}
              scrollOffsetY={scrollY}
            />
            <ContextMenu {...contextMenu} />
            <div id="portal" />
          </>
        </Stack>
      )}
    </>
  )
}

export default Table
