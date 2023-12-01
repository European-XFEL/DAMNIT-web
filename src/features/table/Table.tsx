import "@glideapps/glide-data-grid/dist/index.css"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { connect, useDispatch } from "react-redux"
import {
  CompactSelection,
  DataEditor,
  GridSelection,
  GridColumnIcon,
  Item,
} from "@glideapps/glide-data-grid"
import { useExtraCells } from "@glideapps/glide-data-grid-cells"
import { range } from "@mantine/hooks"

import { gridCellFactory } from "./cells"
import ContextMenu from "./ContextMenu"

import { getTable, selectRun } from "./tableSlice"
import { addPlot } from "../plots"

import { DTYPES, VARIABLES } from "../../common/constants"
import { sorted, sortedInsert, sortedSearch } from "../../utils/array"
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

const usePagination = (pageSize = 5) => {
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
  const handleNewPage = useCallback(async (page, pageSize) => {
    // REMOVEME: Use timeout to better visualize incoming data
    await new Promise((res) => setTimeout(res, 1000))

    let loaded = false

    if (page > 0) {
      // TODO: Create an object that contains `page` and `pageSize`
      loaded = dispatch(getTable(page)).then(() => true)
    }

    return loaded
  }, [])

  // Callback: On visible region changed
  const onVisibleRegionChanged = useCallback((rect) => {
    setVisibleRegion((cv) => {
      return rect
    })
  }, [])

  const loadPage = useCallback(async (page: number) => {
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
  }, [])

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

const Table = (props) => {
  // Initialization: Use custom cells
  const cellProps = useExtraCells()

  // Data: Populate grid
  const getContent = useCallback(
    ([col, row]) => {
      const column = props.columns[col].id
      const rowData = props.data[row]
      const cell = gridCellFactory[props.schema[column].dtype]
      return rowData
        ? cell(rowData[column], {
            lastUpdated: props.lastUpdate[rowData[VARIABLES.run_number]],
          })
        : gridCellFactory[DTYPES.string]("")
    },
    [props.columns, props.data, props.schema, props.lastUpdate],
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
            : props.data[row][VARIABLES.run_number],
      }),
    )

    // Clear range stack if cells from the other column are currently selected
    let rangeStack
    if (!isEmpty(current?.cell) && !isEmpty(current?.rangeStack)) {
      rangeStack =
        current.cell[0] != current.rangeStack[0].x
          ? []
          : current?.rangeStack.filter(
              (range) => !arrayEqual(current.cell, [range.x, range.y]),
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
        run: isEmpty(row) ? null : props.data[row][VARIABLES.run_number],
        variables: isEmpty(col) ? null : [props.columns[col].id],
      }),
    )
  }

  // Context menus
  const [contextMenu, setContextMenu] = useState()
  const handleCellContextMenu = ([col, row], event) => {
    event.preventDefault()

    // Ignore no selection for the meantime
    if (!gridSelection.current) {
      return
    }

    const cells = [
      gridSelection.current.cell,
      ...gridSelection.current.rangeStack.map((range) => [range.x, range.y]),
    ]

    if (
      col !== -1 &&
      cells.length > 1 &&
      cells.some((cell) => arrayEqual(cell, [col, row])) &&
      props.schema[props.columns[col].id].dtype === DTYPES.number
    ) {
      setContextMenu({
        localPosition: { x: event.localEventX, y: event.localEventY },
        bounds: event.bounds,
      })
    }
  }
  const handleHeaderContextMenu = (col, event) => {
    event.preventDefault()
    if (col !== -1) {
      setGridSelection({
        columns: CompactSelection.fromSingleSelection(col),
        rows: CompactSelection.empty(),
      })

      if (props.schema[props.columns[col].id].dtype === DTYPES.number) {
        setContextMenu({
          localPosition: { x: event.localEventX, y: event.localEventY },
          bounds: event.bounds,
        })
      }
    }
  }
  const handleAddPlot = () => {
    if (gridSelection.current) {
      const { cell, rangeStack } = gridSelection.current
      const rows = [cell[1], ...rangeStack.map((stack) => stack.y)]
      props.dispatch(
        addPlot({
          variables: [props.columns[cell[0]].id],
          runs: sorted(
            rows.map((row) => props.data[row][VARIABLES.run_number]),
          ),
        }),
      )
    } else {
      const col = gridSelection.columns.last()
      props.dispatch(
        addPlot({
          variables: [props.columns[col].id],
          runs: sorted(
            props.data.map((rowData) => rowData[VARIABLES.run_number]),
          ),
        }),
      )
    }
  }
  const cellContextContents = [
    {
      key: "plot",
      title: "Plot",
      onClick: handleAddPlot,
    },
  ]

  const paginationProps = usePagination()

  return (
    <div>
      {!props.columns.length ? null : (
        <>
          <DataEditor
            {...(props.grid || {})}
            columns={formatColumns(props.columns, props.schema)}
            getCellContent={getContent}
            height={300}
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
          {contextMenu && (
            <ContextMenu
              {...contextMenu}
              onOutsideClick={() => setTimeout(() => setContextMenu(null), 1)}
              contents={cellContextContents}
            />
          )}
          <div id="portal"></div>
        </>
      )}
    </div>
  )
}

const mapStateToProps = ({ table }) => {
  const data = table.data ? Object.values(table.data) : []

  // TODO: Get the column list from the user settings (reordered columns)
  const columns = Object.keys(table.metadata.schema)
    .filter((id) => id !== VARIABLES.proposal)
    .map((id) => ({ id, title: id }))

  return {
    data,
    columns,
    schema: table.metadata.schema,
    rows: table.metadata.rows,
    lastUpdate: table.lastUpdate,
  }
}

export default connect(mapStateToProps)(Table)

const formatColumns = (columns, schema) => {
  return columns.map((column) => ({
    ...column,
    icon: COLUMN_ICONS[schema[column.id].dtype] || GridColumnIcon.HeaderString,
    ...(schema[column.id].dtype === DTYPES.number && {
      width: 100,
      themeOverride: {
        fontFamily: "monospace",
        headerFontStyle: "",
      },
    }),
  }))
}

const COLUMN_ICONS = {
  image: GridColumnIcon.HeaderImage,
  array: GridColumnIcon.HeaderArray,
  string: GridColumnIcon.HeaderString,
  number: GridColumnIcon.HeaderNumber,
  timestamp: GridColumnIcon.HeaderDate,
}
