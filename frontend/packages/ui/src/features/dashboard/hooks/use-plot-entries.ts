import { useMemo } from 'react'

import { useAppSelector } from '#src/app/store/hooks'
import { formatRunsSubtitle } from '#src/utils/helpers'

export function usePlotEntries() {
  const plots = useAppSelector((state) => state.plots.data)

  return useMemo(
    () =>
      Object.entries(plots).map(([id, plot]) => {
        const subtitle = formatRunsSubtitle(plot.runs)
        return {
          view: { kind: 'plot' as const, id },
          kind: plot.source,
          name: plot.name,
          subtitle,
          // The kind shows as an icon only, so the accessible name spells it out.
          label: `${plot.name}, ${plot.source} plot, ${subtitle}`,
        }
      }),
    [plots]
  )
}
