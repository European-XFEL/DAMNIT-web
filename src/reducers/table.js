import { tableConstants } from "../constants";

export default function table(state = {}, action) {
  switch (action.type) {
    case tableConstants.RECEIVE_TABLE:
      return {
        ...state,
        ...action.payload,
      };
    default:
      return state;
  }
}
