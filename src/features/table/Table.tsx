import "@glideapps/glide-data-grid/dist/index.css"

import React, { useCallback, useState } from "react"
import { connect } from "react-redux"
import {
  CompactSelection,
  DataEditor,
  GridSelection,
} from "@glideapps/glide-data-grid"
import { useExtraCells } from "@glideapps/glide-data-grid-cells"

import { gridCellFactory } from "./cells"
import ContextMenu from "./ContextMenu"

import { selectRun } from "./tableSlice"
import { addPlot } from "../plots"

import { DTYPES, VARIABLES } from "../../common/constants"
import { arrayEqual, isEmpty } from "../../utils/helpers"

const Table = (props) => {
  // Initialization: Use custom cells
  const cellProps = useExtraCells()

  // Data: Populate grid
  const getContent = useCallback(
    ([col, row]) => {
      const column = props.columns[col].id
      const rowData = props.data[row]
      return gridCellFactory[props.schema[column].dtype](rowData[column])
    },
    [props.columns, props.data],
  )

  // Cell: Click event
  const [gridSelection, setGridSelection] = useState({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  })
  const onGridSelectionChange = (newSelection: GridSelection) => {
    const { columns, rows, current } = newSelection

    // Inform that a row has been (de)selected
    const row = rows.last()
    props.dispatch(
      selectRun(isEmpty(row) ? null : props.data[row][VARIABLES.run_number]),
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
          runs: rows
            .map((row) => props.data[row][VARIABLES.run_number])
            .toSorted(),
        }),
      )
    } else {
      const col = gridSelection.columns.last()
      props.dispatch(
        addPlot({
          variables: [props.columns[col].id],
          runs: props.data
            .map((rowData) => rowData[VARIABLES.run_number])
            .toSorted(),
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

  // Format columns
  const formattedColumns = props.columns.map((column) => ({
    ...column,
    ...(props.schema[column.id].dtype === DTYPES.number && {
      width: 100,
      themeOverride: {
        fontFamily: "monospace",
        headerFontStyle: "",
      },
    }),
  }))

  return (
    <div>
      {!props.columns.length ? null : (
        <>
          <DataEditor
            {...(props.grid || {})}
            id="main-table"
            columns={formattedColumns}
            getCellContent={getContent}
            rows={props.data.length}
            rowSelect="single"
            rowMarkers="clickable-number"
            gridSelection={gridSelection}
            onGridSelectionChange={onGridSelectionChange}
            rangeSelect="multi-cell"
            onCellContextMenu={handleCellContextMenu}
            onHeaderContextMenu={handleHeaderContextMenu}
            freezeColumns={1}
            {...cellProps}
          />
          {contextMenu && (
            <ContextMenu
              {...contextMenu}
              onOutsideClick={() => setContextMenu(null)}
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
  const columns = Object.keys(table.schema)
    .filter((id) => id !== VARIABLES.proposal)
    .map((id) => ({ id, title: id }))

  return {
    data,
    columns,
    schema: table.schema,
  }
}

export default connect(mapStateToProps)(Table)
