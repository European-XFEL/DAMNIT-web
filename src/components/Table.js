import "@glideapps/glide-data-grid/dist/index.css";

import React, { useCallback } from "react";
import { connect } from "react-redux";
import { DataEditor, GridCellKind } from "@glideapps/glide-data-grid";
import { useExtraCells } from "@glideapps/glide-data-grid-cells";

import { imageBytesToURL } from "../utils/helpers";

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
      // displayValues: data.map((x) => Math.round(x).toString()), // TODO: Round in server?
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

const Table = ({ data, columns, schema }) => {
  const cellProps = useExtraCells();

  const getContent = useCallback(([col, row]) => {
    const column = columns[col].id;
    const rowData = data[row];
    return gridCellFactory[schema[column]](rowData[column]);
  }, []);

  return (
    <div>
      <DataEditor
        columns={columns}
        getCellContent={getContent}
        rows={data.length}
        {...cellProps}
      />
      <div id="portal"></div>
    </div>
  );
};

const mapStateToProps = ({ table }) => {
  const data = table.data ? Object.values(table.data) : [];

  // TODO: Get the column list from the user settings (reordered columns)
  const columns = table.schema
    ? Object.keys(table.schema).map((id) => ({ id, title: id }))
    : [];

  return { data, columns, schema: table.schema };
};

export default connect(mapStateToProps)(Table);
