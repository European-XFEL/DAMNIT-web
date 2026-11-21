import { useSearchParams } from 'react-router'

import { useOpenView } from '#src/features/dashboard/hooks/use-open-view'
import { WINDOW_FLAG } from '#src/features/plots/plot-address'

export function useIsPlotWindow() {
  const view = useOpenView()
  const [searchParams] = useSearchParams()

  return view?.kind === 'plot' && searchParams.has(WINDOW_FLAG)
}
