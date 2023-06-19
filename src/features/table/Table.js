import "@glideapps/glide-data-grid/dist/index.css";

import React, { useCallback } from "react";
import { connect } from "react-redux";
import { DataEditor, GridCellKind } from "@glideapps/glide-data-grid";
import { useExtraCells } from "@glideapps/glide-data-grid-cells";

import { selectRow } from "./tableSlice";
import { imageBytesToURL } from "../../utils/helpers";

const EMPTY_VALUE = "None";

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

const Table = ({ data, columns, schema, selection, dispatch }) => {
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
  const handleCellClicked = ([col, row], params) => {
    // Only handle handles click on the row markers (col = -1)
    if (col !== -1) {
      return;
    }

    // Inform that the row has been (de)selected
    dispatch(selectRow(row === selection.row ? null : row));
  };

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
            onCellClicked={handleCellClicked}
            {...cellProps}
          />
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
    selection: table.selection ? table.selection : {},
  };
};

export default connect(mapStateToProps)(Table);
