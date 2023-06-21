import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { tableService } from "../../utils/api";

const initialState = {
  data: {},
  schema: {},
  selection: {},
};

export const getTable = createAsyncThunk("table/getTable", async () => {
  const result = await tableService.getTable();
  return result;
});

const slice = createSlice({
  name: "table",
  initialState,
  reducers: {
    selectRow: ({ selection }, action) => {
      selection.row = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(getTable.fulfilled, (state, action) => {
      const { data, schema } = action.payload;
      state.data = data;
      state.schema = schema;
    });
    // TODO: Add getTable.pending and getTable.rejected
  },
});

export default slice.reducer;
export const { selectRow } = slice.actions;
