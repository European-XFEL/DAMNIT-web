import { tableConstants } from "../constants";

export const tableActions = {
  receiveTable,
};

function receiveTable(table) {
  return {
    type: tableConstants.RECEIVE_TABLE,
    payload: table,
  };
}
