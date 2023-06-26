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

import { selectRun } from "./tableSlice";
import { addPlot } from "../plots";

import { DTYPES, EMPTY_VALUE, RUN_NUMBER } from "../../common/constants";
import { arrayEqual, imageBytesToURL, isEmpty } from "../../utils/helpers";

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

const Table = (props) => {
  // Initialization: Use custom cells
  const cellProps = useExtraCells();

  // Data: Populate grid
  const getContent = useCallback(
    ([col, row]) => {
      const column = props.columns[col].id;
      const rowData = props.data[row];
      return gridCellFactory[props.schema[column].dtype](rowData[column]);
    },
    [props.columns, props.data]
  );

  // Cell: Click event
  const [gridSelection, setGridSelection] = useState({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const onGridSelectionChange = (newSelection: GridSelection) => {
    const { columns, rows, current } = newSelection;

    // Inform that a row has been (de)selected
    const row = rows.last();
    props.dispatch(
      selectRun(isEmpty(row) ? null : props.data[row][RUN_NUMBER])
    );

    // Clear range stack if cells from the other column are currently selected
    let rangeStack;
    if (!isEmpty(current?.cell) && !isEmpty(current?.rangeStack)) {
      rangeStack =
        current.cell[0] != current.rangeStack[0].x
          ? []
          : current?.rangeStack.filter(
              (range) => !arrayEqual(current.cell, [range.x, range.y])
            );
    }

    // Finalize
    setGridSelection({
      columns,
      rows,
      ...(current && {
        current: { ...current, ...(rangeStack && { rangeStack }) },
      }),
    });
  };

  // Context menus
  const [contextMenu, setContextMenu] = useState();
  const handleCellContextMenu = ([col, row], event) => {
    event.preventDefault();
    const cells = [
      gridSelection.current.cell,
      ...gridSelection.current.rangeStack.map((range) => [range.x, range.y]),
    ];

    if (
      col !== -1 &&
      cells.length > 1 &&
      cells.some((cell) => arrayEqual(cell, [col, row])) &&
      props.schema[props.columns[col].id].dtype === DTYPES.number
    ) {
      setContextMenu({
        localPosition: { x: event.localEventX, y: event.localEventY },
        bounds: event.bounds,
      });
    }
  };
  const handleHeaderContextMenu = (col, event) => {
    event.preventDefault();
    if (col !== -1) {
      setGridSelection({
        columns: CompactSelection.fromSingleSelection(col),
        rows: CompactSelection.empty(),
      });

      if (props.schema[props.columns[col].id].dtype === DTYPES.number) {
        setContextMenu({
          localPosition: { x: event.localEventX, y: event.localEventY },
          bounds: event.bounds,
        });
      }
    }
  };
  const handleAddPlot = () => {
    if (gridSelection.current) {
      const { cell, rangeStack } = gridSelection.current;
      const rows = [cell[1], ...rangeStack.map((stack) => stack.y)];
      props.dispatch(
        addPlot({
          variables: [props.columns[cell[0]].id],
          runs: rows.map((row) => props.data[row][RUN_NUMBER]).toSorted(),
        })
      );
    } else {
      const col = gridSelection.columns.last();
      props.dispatch(
        addPlot({
          variables: [props.columns[col].id],
          runs: props.data.map((rowData) => rowData[RUN_NUMBER]).toSorted(),
        })
      );
    }
  };
  const cellContextContents = [
    {
      key: "plot",
      title: "Plot",
      onClick: handleAddPlot,
    },
  ];

  return (
    <div>
      {!props.columns.length ? null : (
        <>
          <DataEditor
            columns={props.columns}
            getCellContent={getContent}
            rows={props.data.length}
            rowSelect="single"
            rowMarkers="clickable-number"
            gridSelection={gridSelection}
            onGridSelectionChange={onGridSelectionChange}
            rangeSelect="multi-cell"
            onCellContextMenu={handleCellContextMenu}
            onHeaderContextMenu={handleHeaderContextMenu}
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

export default connect(mapStateToProps)(Table);
