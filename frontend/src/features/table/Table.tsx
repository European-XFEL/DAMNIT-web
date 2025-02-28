import React, { useCallback, useEffect, useRef, useState } from "react"
import { connect, useDispatch, useSelector } from "react-redux"
import {
  CompactSelection,
  DataEditor,
  GridSelection,
  Item,
} from "@glideapps/glide-data-grid"
import { allCells } from "@glideapps/glide-data-grid-cells"
import { range } from "@mantine/hooks"

import { getCell, numberCell, textCell } from "./cells"
import ContextMenu from "./ContextMenu"

import { selectRun } from "./tableSlice"
import { addPlot } from "../plots"
import {
  getDeferredTableData,
  getExtractedVariable,
  getTableVariables,
} from "../../redux/slices"

import { EXCLUDED_VARIABLES, VARIABLES } from "../../constants"
import {
  isArrayEqual,
  sorted,
  sortedInsert,
  sortedSearch,
} from "../../utils/array"
import { canPlotData } from "../../utils/plots"
import { isEmpty } from "../../utils/helpers"

class Pages {
  constructor() {
    this.loading = []
    this.loaded = []
  }

  addToLoading(page) {
    sortedInsert(this.loading, page)
  }

  isLoading(page) {
    return sortedSearch(this.loading, page) !== -1
  }

  addToLoaded(page) {
    // Remove from loading
    const index = sortedSearch(this.loading, page)
    if (index !== -1) {
      this.loading.splice(index, 1)
    }

    sortedInsert(this.loaded, page)
  }

  isLoaded(page) {
    return sortedSearch(this.loaded, page) !== -1
  }
}

const usePagination = (proposal, pageSize = 10) => {
  const dispatch = useDispatch()

  // Reference: Loaded pages
  const pagesRef = useRef(new Pages())

  // State: Visible pages
  const [visibleRegion, setVisibleRegion] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })

  // Callback: Handle new page
  const handleNewPage = useCallback(
    async (page) => {
      if (!proposal || page <= 0) {
        return false
      }

      try {
        await dispatch(getDeferredTableData({ proposal, page, pageSize }))
        return true
      } catch (error) {
        console.error("Failed to load data:", error)
        return false
      }
    },
    [proposal, dispatch],
  )

  // Callback: On visible region changed
  const onVisibleRegionChanged = useCallback((rect) => {
    setVisibleRegion((_) => {
      return rect
    })
  }, [])

  const loadPage = useCallback(
    async (page: number) => {
      // TODO: Add a retry when loading pages are stuck for quite some time
      const pages = pagesRef.current

      if (pages.isLoading(page) || pages.isLoaded(page)) {
        return
      }

      pages.addToLoading(page)
      const loaded = await handleNewPage(page, pageSize)
      if (loaded) {
        pages.addToLoaded(page)
      }
    },
    [handleNewPage, pageSize],
  )

  // Effect: Trigger load page when visible region changes
  useEffect(() => {
    if (visibleRegion.width === 0 || visibleRegion.height === 0) {
      return
    }

    const firstPage = Math.max(
      0,
      Math.floor((visibleRegion.y - pageSize / 2) / pageSize),
    )
    const lastPage = Math.floor(
      (visibleRegion.y + visibleRegion.height + pageSize / 2) / pageSize,
    )
    range(firstPage + 1, lastPage + 2).map((page) => {
      if (!pagesRef.current.isLoaded(page)) {
        loadPage(page)
      }
    })
  }, [loadPage, pageSize, visibleRegion])

  return { onVisibleRegionChanged }
}

const useContextMenu = () => {
  const closedProps = {
    localPosition: { x: 0, y: 0 },
    bounds: {},
    isOpen: false,
    contents: [],
  }
  const [props, setProps] = useState(closedProps)

  const handleOutsideClick = () => {
    setProps(closedProps)
  }

  const updateProps = (newProps) => {
    const updated = newProps ? { ...newProps, isOpen: true } : closedProps
    setProps(updated)
  }

  return [{ ...props, onOutsideClick: handleOutsideClick }, updateProps]
}

const Table = (props) => {
  // Initialization
  const proposal = useSelector((state) => state.proposal.current.value)
  const paginationProps = usePagination(proposal)

  // Data: Populate grid
  const getContent = useCallback(
    ([col, row]) => {
      const run = props.runs[row]
      const variable = props.columns[col]?.id

      if (variable === VARIABLES.run) {
        return numberCell(run)
      }

      const rowData = props.data[run]
      if (!rowData || !rowData[variable]) {
        return textCell("")
      }

      const cell = getCell(rowData[variable].value, rowData[variable].dtype)
      return cell(rowData[variable].value, {
        lastUpdated: props.lastUpdate[run],
        name: variable,
      })
    },
    [props.columns, props.runs, props.data, props.lastUpdate],
  )

  // Cell: Click event
  const [gridSelection, setGridSelection] = useState({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: undefined,
  })
  const handleGridSelectionChange = (newSelection: GridSelection) => {
    const { columns, rows, current } = newSelection

    // Inform that a row has been (de)selected
    const row = rows.last()
    const run = props.runs[row]

    props.dispatch(
      selectRun({
        run,
      }),
    )

    // Clear range stack if cells from the other column are currently selected
    let rangeStack
    if (!isEmpty(current?.cell) && !isEmpty(current?.rangeStack)) {
      rangeStack =
        current.cell[0] != current.rangeStack[0].x
          ? []
          : current?.rangeStack.filter(
              (range) => !isArrayEqual(current.cell, [range.x, range.y]),
            )
    }

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
    const run = props.runs[row]

    props.dispatch(
      selectRun({
        run: run,
        variables: isEmpty(col) ? null : [props.columns[col].id],
      }),
    )
  }

  // Context menus
  const [contextMenu, setContextMenu] = useContextMenu()
  const handleCellContextMenu = ([col, row], event) => {
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

    const column = props.columns[col]?.id
    const rowData = props.data[props.runs[row]]

    if (
      col !== -1 &&
      canPlotData(rowData[column]?.value, rowData[column]?.dtype)
    ) {
      const variable = props.columns[col]
      const subtitle = `${variable.title}`

      const rows = [selectedCell[1], ...selectedRange.map((rect) => rect.y)]
      const runs = sorted(rows.map((row) => props.runs[row]))

      setContextMenu({
        localPosition: { x: event.localEventX, y: event.localEventY },
        bounds: event.bounds,
        contents: [
          {
            key: "plot",
            title: "Plot: data",
            subtitle,
            onClick: () =>
              addDataPlot({ variable: variable.id, label: subtitle, runs }),
          },
        ],
      })
    }
  }
  const handleHeaderContextMenu = (col, event) => {
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
        const variable = props.columns[col]
        const subtitle = `${variable.title} vs. Run`

        setContextMenu({
          localPosition: { x: event.localEventX, y: event.localEventY },
          bounds: event.bounds,
          contents: [
            {
              key: "plot",
              title: "Plot: summary",
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
      const y = props.columns[col] // the latest selection
      const x = props.columns[col0] // the first selection

      const subtitle = `${y.title} vs. ${x.title}`

      setContextMenu({
        localPosition: { x: event.localEventX, y: event.localEventY },
        bounds: event.bounds,
        contents: [
          {
            key: "plot",
            title: "Plot: summary",
            subtitle,
            onClick: () =>
              addSummaryPlot({ variables: [x.id, y.id], label: subtitle }),
          },
        ],
      })
    }
  }

  const addSummaryPlot = ({ variables, label }) => {
    props.dispatch(
      addPlot({
        variables,
        source: "table",
        title: `Summary: ${label}`,
      }),
    )

    props.dispatch(
      getTableVariables({
        proposal,
        variables,
      }),
    )
  }

  const addDataPlot = ({ variable, label, runs }) => {
    props.dispatch(
      addPlot({
        runs,
        variables: [variable],
        source: "extracted",
        title: `Data: ${label}`,
      }),
    )
    runs.forEach((run) => {
      props.dispatch(getExtractedVariable({ proposal, run, variable }))
    })
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {!props.columns.length ? null : (
        <>
          <DataEditor
            {...(props.grid || {})}
            columns={formatColumns(props.columns)}
            getCellContent={getContent}
            rows={props.runs.length}
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
            {...paginationProps}
          />
          <ContextMenu {...contextMenu} />
          <div id="portal" />
        </>
      )}
    </div>
  )
}

const mapStateToProps = ({ tableData: table }) => {
  // TODO: Get the column list from the user settings (reordered columns)
  const columns = Object.values(table.metadata.variables)
    .filter(({ name }) => !EXCLUDED_VARIABLES.includes(name))
    .map(({ name, title }) => ({ id: name, title: title || name }))

  return {
    data: table.data,
    columns,
    runs: table.metadata.runs,
    lastUpdate: table.lastUpdate,
  }
}

export default connect(mapStateToProps)(Table)

const formatColumns = (columns) => {
  return columns.map((column) => ({
    ...column,
    width: 100,
  }))
}
