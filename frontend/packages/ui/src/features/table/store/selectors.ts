import { type RootState } from '../../../redux/reducer'
import { createTypedSelector } from '../../../redux/selectors'

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
