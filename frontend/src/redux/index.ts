export {
  default as tableDataReducer,
  getTableData,
  getTableVariable,
  resetTableData,
  updateTableData,
} from "./slices/tableData"
export {
  default as extractedDataReducer,
  getExtractedVariable,
  resetExtractedData,
} from "./slices/extractedData"
export {
  default as proposalReducer,
  setProposalPending,
  setProposalSuccess,
  setProposalNotFound,
} from "./slices/proposal"
export { setupStore } from "./store"
export { getAllExtractedVariables } from "./thunks"
