import { tableConstants } from "../constants";

export const tableActions = {
  receiveTable,
  selectRow,
};

function receiveTable(table) {
  return {
    type: tableConstants.RECEIVE_TABLE,
    payload: table,
  };
}

function selectRow(row) {
  return {
    type: tableConstants.SELECT_ROW,
    payload: { selection: { row } },
  };
}
