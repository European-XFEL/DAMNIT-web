import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { selectActiveView } from '#src/features/dashboard/stores/dashboard.selectors'
import { viewSelected } from '#src/features/dashboard/stores/dashboard.slice'
import { type View } from '#src/features/dashboard/types/dashboard.types'
import { isSameView } from '#src/features/dashboard/utils/views'

export function useViews() {
  const dispatch = useAppDispatch()
  const activeView = useAppSelector(selectActiveView)

  return {
    isActive: (view: View) => isSameView(activeView, view),
    select: (view: View) => {
      dispatch(viewSelected(view))
    },
  }
}
