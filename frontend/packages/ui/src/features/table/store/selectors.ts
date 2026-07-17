import type { RootState } from '#src/app/store/types'
import { createTypedSelector } from '#src/app/store/selectors'

// ----------------------------------------------------------------------------
// Variables

const selectVariables = (state: RootState) => state.table.variables

export const selectVariableVisibility = createTypedSelector(
  [selectVariables],
  (variables) =>
    Object.fromEntries(
      Object.entries(variables).map(([variable, settings]) => [
        variable,
        settings.visibility,
      ])
    )
)

// ----------------------------------------------------------------------------
// Tags

const selectTags = (state: RootState) => state.table.tags

export const selectTagSelection = createTypedSelector(
  [selectTags],
  (variables) =>
    Object.fromEntries(
      Object.entries(variables).map(([variable, settings]) => [
        variable,
        settings.isSelected,
      ])
    )
)
