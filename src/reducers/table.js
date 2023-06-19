import { tableConstants } from "../constants";

const initialState = {
  data: null,
  schema: null,
  selection: null,
};

export default function table(state = initialState, action) {
  switch (action.type) {
    case tableConstants.RECEIVE_TABLE:
      return {
        ...state,
        ...action.payload,
      };
    case tableConstants.SELECT_ROW:
      return {
        ...state,
        ...action.payload,
      };
    default:
      return state;
  }
}
