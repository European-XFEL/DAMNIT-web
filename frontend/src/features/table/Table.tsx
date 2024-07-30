import "@glideapps/glide-data-grid/dist/index.css"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { connect, useDispatch, useSelector } from "react-redux"
import {
  CompactSelection,
  DataEditor,
  GridSelection,
  Item,
} from "@glideapps/glide-data-grid"
import { useExtraCells } from "@glideapps/glide-data-grid-cells"
import { range, useDisclosure } from "@mantine/hooks"

import { gridCellFactory } from "./cells"
import ContextMenu from "./ContextMenu"

import { selectRun } from "./tableSlice"
import { addPlot } from "../plots"
import {
  getExtractedVariable,
  getTableData,
  getTableVariable,
} from "../../redux"

import { DTYPES, VARIABLES } from "../../constants"
import {
  isArrayEqual,
  sorted,
  sortedInsert,
  sortedSearch,
} from "../../utils/array"
import { isDataPlottable } from "../../utils/plots"
import { createMap, isEmpty } from "../../utils/helpers"
import PlotDialog from "../plots/PlotDialog"

export const EXCLUDED_VARIABLES = ["proposal", "start_time"]

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

const usePagination = (proposal, pageSize = 5) => {
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
    async (page, pageSize) => {
      if (!proposal) {
        return
      }

      let loaded = false

      if (page > 0) {
        // TODO: Create an object that contains `page` and `pageSize`
        loaded = dispatch(getTableData({ proposal, page })).then(() => true)
      }

      return loaded
    },
    [proposal, dispatch],
  )

  // Callback: On visible region changed
  const onVisibleRegionChanged = useCallback((rect) => {
    setVisibleRegion((cv) => {
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
  const cellProps = useExtraCells()
  const proposal = useSelector((state) => state.proposal.current.value)
  const paginationProps = usePagination(proposal)

  // Data: Populate grid
  const getContent = useCallback(
    ([col, row]) => {
      const column = props.columns[col].id
      const rowData = props.data[row]

      if (!rowData || !rowData[column]) {
        return gridCellFactory[DTYPES.string]("")
      }

      const cell = gridCellFactory[rowData[column]?.dtype]
      return cell(rowData[column].value, {
        lastUpdated: props.lastUpdate[rowData[VARIABLES.run_number]],
      })
    },
    [props.columns, props.data, props.lastUpdate],
  )

  // Cell: Click event
  const [gridSelection, setGridSelection] = useState({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  })
  const handleGridSelectionChange = (newSelection: GridSelection) => {
    const { columns, rows, current } = newSelection

    // Inform that a row has been (de)selected
    const row = rows.last()
    props.dispatch(
      selectRun({
        run:
          isEmpty(row) || !props.data[row]
            ? null
            : props.data[row][VARIABLES.run_number].value,
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
      ...(current && {
        current: { ...current, ...(rangeStack && { rangeStack }) },
      }),
    })
  }
  const handleCellActivated = (cell: Item) => {
    const [col, row] = cell
    props.dispatch(
      selectRun({
        run: isEmpty(row) ? null : props.data[row][VARIABLES.run_number].value,
        variables: isEmpty(col) ? null : [props.columns[col].id],
      }),
    )
  }

  // Context menus
  const [contextMenu, setContextMenu] = useContextMenu()
  const handleCellContextMenu = ([col, row], event) => {
    event.preventDefault()

    const column = props.columns[col].id
    const rowData = props.data[row]

    if (col !== -1 && isDataPlottable(rowData[column].dtype)) {
      setContextMenu({
        localPosition: { x: event.localEventX, y: event.localEventY },
        bounds: event.bounds,
        contents: ["plot"],
      })
    }
  }
  const handleHeaderContextMenu = (col, event) => {
    event.preventDefault()
    const columnSelection = gridSelection.columns.toArray()
    if (columnSelection.length === 1) {
      if (col !== -1) {
        setContextMenu({
          localPosition: { x: event.localEventX, y: event.localEventY },
          bounds: event.bounds,
          contents: ["plot"],
        })
      }
    } else if (columnSelection.length === 2) {
      setContextMenu({
        localPosition: { x: event.localEventX, y: event.localEventY },
        bounds: event.bounds,
        contents: ["corrPlot"],
      })
    }
  }

  const handleAddPlot = () => {
    if (gridSelection.current) {
      const { cell, rangeStack } = gridSelection.current
      const rows = [cell[1], ...rangeStack.map((stack) => stack.y)]

      const variable = props.columns[cell[0]].id
      const runs = sorted(
        rows.map((row) => props.data[row][VARIABLES.run_number].value),
      )
      props.dispatch(
        addPlot({
          runs,
          variables: [variable],
          source: "extracted",
        }),
      )
      runs.forEach((run) => {
        props.dispatch(getExtractedVariable({ proposal, run, variable }))
      })
    } else {
      const col = gridSelection.columns.last()
      props.dispatch(
        addPlot({
          variables: [props.columns[col].id],
          source: "table",
        }),
      )
      props.dispatch(
        getTableVariable({
          proposal,
          variable: props.columns[col].id,
        }),
      )
    }
  }

  const handleAddCorrPlot = () => {
    const cols = gridSelection.columns.toArray()
    props.dispatch(
      addPlot({
        variables: [props.columns[cols[0]].id, props.columns[cols[1]].id],
        source: "table",
      }),
    )
  }

  const handlePlotOptions = () => {
    // set states for pre configurable plotting settings here
    // Pass they as props to the modal
    handlersPlotDialog.open()
  }

  const cellContextContents = createMap(
    [
      {
        key: "plot",
        title: "Plot",
        onClick: handleAddPlot,
      },
      {
        key: "corrPlot",
        title: "Correlation plot",
        onClick: handleAddCorrPlot,
      },
      {
        key: "advPlot",
        title: "Plot options",
        onClick: handlePlotOptions,
      },
    ],
    "key",
  )

  const [openedPlotDialog, handlersPlotDialog] = useDisclosure(false)

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {!props.columns.length ? null : (
        <>
          <DataEditor
            {...(props.grid || {})}
            columns={formatColumns(props.columns)}
            getCellContent={getContent}
            rows={props.rows}
            rowSelect="single"
            rowMarkers="clickable-number"
            gridSelection={gridSelection}
            onGridSelectionChange={handleGridSelectionChange}
            onCellActivated={handleCellActivated}
            rangeSelect="multi-cell"
            onCellContextMenu={handleCellContextMenu}
            onHeaderContextMenu={handleHeaderContextMenu}
            freezeColumns={1}
            {...cellProps}
            {...paginationProps}
          />
          <ContextMenu
            {...contextMenu}
            contents={contextMenu.contents.map((key) =>
              cellContextContents.get(key),
            )}
          />
          {openedPlotDialog && (
            <PlotDialog
              opened={openedPlotDialog}
              open={handlersPlotDialog.open}
              close={handlersPlotDialog.close}
              selectedColumns={props.columns
                .filter((_, index) =>
                  gridSelection.columns.toArray().includes(index),
                )
                .map((col) => col.id)}
            />
          )}
          <div id="portal" />
        </>
      )}
    </div>
  )
}

const mapStateToProps = ({ tableData: table }) => {
  const data = table.data ? Object.values(table.data) : []
  // TODO: Get the column list from the user settings (reordered columns)
  const columns = Object.values(table.metadata.variables)
    .filter(({ name }) => !EXCLUDED_VARIABLES.includes(name))
    .map(({ name, title }) => ({ id: name, title }))

  return {
    data,
    columns,
    rows: table.metadata.rows,
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
