import { sharedService } from "../utils/api";
import { tableActions } from "./table";

export const sharedActions = {
  getInitialData,
};

function getInitialData() {
  return (dispatch) => {
    return sharedService.getInitialData().then(({ table }) => {
      dispatch(tableActions.receiveTable(table));
    });
  };
}
