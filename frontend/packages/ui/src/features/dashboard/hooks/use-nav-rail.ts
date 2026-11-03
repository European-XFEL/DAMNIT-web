import { useAppSelector } from '#src/app/store/hooks'
import { useIsMobile } from '#src/features/dashboard/hooks/use-is-mobile'
import { selectNavCollapsed } from '#src/features/dashboard/stores/dashboard.selectors'

// Collapsing is a desktop preference: below `sm` the nav is drawn full width,
// where a rail would stretch across the screen with nothing to expand it.
export function useNavRail() {
  const collapsed = useAppSelector(selectNavCollapsed)
  const isMobile = useIsMobile()

  return collapsed && !isMobile
}
