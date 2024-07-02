export {
  default as tableDataReducer,
  getTableData,
  getTableVariable,
  resetTableData,
  updateTableData,
} from "./tableDataSlice"
export {
  default as extractedDataReducer,
  getExtractedVariable,
  getAllExtracted,
  resetExtractedData,
} from "./extractedDataSlice"
export {
  default as proposalReducer,
  setProposalPending,
  setProposalSuccess,
  setProposalNotFound,
} from "./proposalSlice"
