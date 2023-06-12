import { tableService } from "../utils/api";
import { tableActions } from "./table";

export const sharedActions = {
  getInitialData,
};

function getInitialData() {
  return (dispatch) => {
    return tableService.getTable().then((table) => {
      dispatch(tableActions.receiveTable(table));
    });
  };
}
