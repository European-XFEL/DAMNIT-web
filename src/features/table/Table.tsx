import "@glideapps/glide-data-grid/dist/index.css";

import React, { useCallback, useState } from "react";
import { connect } from "react-redux";
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  GridSelection,
} from "@glideapps/glide-data-grid";
import { useExtraCells } from "@glideapps/glide-data-grid-cells";

import ContextMenu from "./ContextMenu";

import { selectRow } from "./tableSlice";
import { addPlot } from "../plots";

import { EMPTY_VALUE, RUN_NUMBER } from "../../common/constants";
import { imageBytesToURL, isEmpty } from "../../utils/helpers";
import { formatPlot } from "../plots/utils";

const imageCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Image,
    allowOverlay: true,
    data: [imageBytesToURL(data)],
  };
};

const textCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Text,
    allowOverlay: false,
    displayData: data !== EMPTY_VALUE ? data : "",
    data,
  };
};

const numberCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Number,
    allowOverlay: false,
    displayData: data !== EMPTY_VALUE ? String(data) : "",
    data,
  };
};

const arrayCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Custom,
    allowOverlay: false,
    copyData: "4",
    data: {
      kind: "sparkline-cell",
      values: data,
      // displayValues: TODO: Round in server?
      color: "#77c4c4",
      yAxis: [Math.min(...data), Math.max(...data)],
    },
  };
};

const gridCellFactory = {
  image: imageCell,
  string: textCell,
  number: numberCell,
  array: arrayCell,
};

const Table = ({ data, columns, schema, dispatch, addPlot }) => {
  // Initialization: Use custom cells
  const cellProps = useExtraCells();

  // Data: Populate grid
  const getContent = useCallback(
    ([col, row]) => {
      const column = columns[col].id;
      const rowData = data[row];
      return gridCellFactory[schema[column].dtype](rowData[column]);
    },
    [columns, data]
  );

  // Cell: Click event
  const [gridSelection, setGridSelection] = useState({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });

  const onGridSelectionChange = (newSelection: GridSelection) => {
    const { current, columns, rows } = newSelection;

    // Inform that a row has been (de)selected
    const row = rows.last();
    dispatch(selectRow(isEmpty(row) ? null : row));

    // Clear range stack if cells from the other column are currently selected
    if (!isEmpty(current?.cell) && !isEmpty(current?.rangeStack)) {
      if (current.cell[0] != current.rangeStack[0].x) {
        newSelection = {
          columns,
          rows,
          current: {
            ...current,
            rangeStack: [],
          },
        };
      }
    }

    // Finalize
    setGridSelection(newSelection);
  };

  // Cell: Right click event
  const [cellContextMenu, setCellContextMenu] = useState();
  const handleCellContextMenu = (_, event) => {
    event.preventDefault();
    setCellContextMenu({
      localPosition: { x: event.localEventX, y: event.localEventY },
      bounds: event.bounds,
    });
  };
  const handleAddPlot = () => {
    const { cell, rangeStack } = gridSelection.current;
    const rows = [cell[1], ...rangeStack.map((stack) => stack.y)];

    addPlot({
      variable: columns[cell[0]].id,
      runs: rows.map((row) => data[row][RUN_NUMBER]).toSorted(),
    });
  };
  const cellContextContents = [
    {
      key: "plot",
      title: "Plot",
      onClick: handleAddPlot,
    },
    {
      key: "option2",
      title: "Option 2",
      onClick: () => console.log("OPTION 2"),
    },
  ];

  return (
    <div>
      {columns.length && (
        <>
          <DataEditor
            columns={columns}
            getCellContent={getContent}
            rows={data.length}
            rowSelect="single"
            rowMarkers="clickable-number"
            gridSelection={gridSelection}
            onGridSelectionChange={onGridSelectionChange}
            rangeSelect="multi-cell"
            onCellContextMenu={handleCellContextMenu}
            {...cellProps}
          />
          {cellContextMenu && (
            <ContextMenu
              {...cellContextMenu}
              onOutsideClick={() => setCellContextMenu(null)}
              contents={cellContextContents}
            />
          )}
          <div id="portal"></div>
        </>
      )}
    </div>
  );
};

const mapStateToProps = ({ table }) => {
  const data = table.data ? Object.values(table.data) : [];

  // TODO: Get the column list from the user settings (reordered columns)
  const columns = Object.keys(table.schema).map((id) => ({ id, title: id }));

  return {
    data,
    columns,
    schema: table.schema,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    addPlot: (props) => dispatch(addPlot(formatPlot(props))),
    dispatch,
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(Table);
