import type { ReactNode } from 'react'
import { IconFileCode, IconTable } from '@tabler/icons-react'

import PlotKindIcon from '#src/components/icons/plot-kind-icon'
import { useOpenView } from '#src/features/dashboard/hooks/use-open-view'
import { usePlotEntries } from '#src/features/dashboard/hooks/use-plot-entries'

export type Crumb = {
  label: string
  icon?: ReactNode
  // Read after the label, since the icon itself is hidden from screen readers.
  iconLabel?: string
  detail?: string
}

export function useViewCrumbs(): Crumb[] {
  const view = useOpenView()
  const plots = usePlotEntries()

  switch (view?.kind) {
    case 'table':
      return [
        { label: 'Table' },
        { label: 'All runs', icon: <IconTable stroke={1.5} /> },
      ]
    case 'context-file':
      return [{ label: 'Context file', icon: <IconFileCode stroke={1.5} /> }]
    case 'plot': {
      const plot = plots.find((entry) => entry.id === view.id)
      if (!plot) {
        return [{ label: 'Plots' }]
      }

      return [
        { label: 'Plots' },
        {
          label: plot.name,
          icon: <PlotKindIcon kind={plot.kind} />,
          iconLabel: `${plot.kind} plot`,
          detail: plot.subtitle,
        },
      ]
    }
    case undefined:
      return []
  }
}
