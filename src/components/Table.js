import "@glideapps/glide-data-grid/dist/index.css";

import React, { useCallback } from "react";
import { connect } from "react-redux";
import { DataEditor, GridCellKind } from "@glideapps/glide-data-grid";

const Table = ({ data, schema }) => {
  const getContent = useCallback(([col, row]) => {
    const rowData = data[row];
    const cellData = rowData[schema[col]];
    return {
      kind: GridCellKind.Text,
      allowOverlay: false,
      displayData: String(cellData),
      data: cellData,
    };
  }, []);

  const columns = schema.map((id) => {
    return { id, title: id };
  });

  return (
    <DataEditor
      columns={columns}
      getCellContent={getContent}
      rows={data.length}
    />
  );
};

const mapStateToProps = ({ table }) => {
  const data = table.data ? Object.values(table.data) : [];
  const schema = data.length ? Object.keys(data[0]) : [];
  return { data, schema };
};

export default connect(mapStateToProps)(Table);
