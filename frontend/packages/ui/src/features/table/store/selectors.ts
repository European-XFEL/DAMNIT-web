import { type RootState } from '../../../redux/reducer'
import { createTypedSelector } from '../../../redux/selectors'

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
