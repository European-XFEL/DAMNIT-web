import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../redux/reducer";
import { getTable } from "../../data/table";

interface VisibilitySettingsState {
  visibleColumns: Record<string, boolean>;
}

const initialState: VisibilitySettingsState = {
  visibleColumns: {},
};

const visibilitySettingsSlice = createSlice({
  name: "visibilitySettings",
  initialState,
  reducers: {
    initializeColumns: (state, action: PayloadAction<string[]>) => {
      state.visibleColumns = Object.fromEntries(
        action.payload.map(varName => [varName, true])
      );
    },
    toggleColumnVisibility: (state, action: PayloadAction<string>) => {
      const varName = action.payload;
      if (varName in state.visibleColumns) {
        state.visibleColumns[varName] = !state.visibleColumns[varName];
      }
    },
    setColumnGroupVisibility: (
      state,
      action: PayloadAction<{ columnNames: string[]; isVisible: boolean }>
    ) => {
      const { columnNames, isVisible } = action.payload;
      columnNames.forEach(name => {
        if (name in state.visibleColumns) {
          state.visibleColumns[name] = isVisible;
        }
      });
    },
  },
  extraReducers: (builder) => {
    builder.addCase(getTable.fulfilled, (state, action) => {
      const newVariables = action.payload.metadata?.variables;
      if (newVariables) {
        const nextVisibleColumns: Record<string, boolean> = {};
        for (const varName of Object.keys(newVariables)) {
          nextVisibleColumns[varName] = state.visibleColumns[varName] ?? true;
        }
        state.visibleColumns = nextVisibleColumns;
      }
    });
  },
});

export const {
  initializeColumns,
  toggleColumnVisibility,
  setColumnGroupVisibility,
} = visibilitySettingsSlice.actions;

export const selectVisibleColumns = (state: RootState) => state.visibilitySettings.visibleColumns;

export default visibilitySettingsSlice.reducer;