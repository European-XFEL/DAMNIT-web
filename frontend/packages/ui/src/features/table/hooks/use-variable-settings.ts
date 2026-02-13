import { useAppSelector } from '../../../redux/hooks'
import { selectVariableVisibility } from '../store/selectors'

export function useVariableSettings() {
  const visibility = useAppSelector(selectVariableVisibility)

  return { visibility }
}
