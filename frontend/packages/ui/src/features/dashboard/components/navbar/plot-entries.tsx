import { type ReactNode } from 'react'
import { ActionIcon, Text, UnstyledButton } from '@mantine/core'
import { IconX } from '@tabler/icons-react'

import PlotKindIcon from '#src/features/plots/plot-kind-icon'
import { removePlot } from '#src/features/plots/plots.slice'
import { type PlotSource } from '#src/types'
import { useAppDispatch } from '#src/app/store/hooks'
import { usePlotEntries } from '#src/features/dashboard/hooks/use-plot-entries'
import { useViews } from '#src/features/dashboard/hooks/use-views'

import classes from './navbar.module.css'

type PlotEntryProps = {
  kind: PlotSource
  name: string
  subtitle: string
  label: string
  active: boolean
  onSelect: () => void
  onClose: () => void
}

function PlotEntry({
  kind,
  name,
  subtitle,
  label,
  active,
  onSelect,
  onClose,
}: PlotEntryProps) {
  return (
    <li className={classes.entry} data-active={active || undefined}>
      <UnstyledButton
        className={classes.entryButton}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={onSelect}
      >
        <span className={classes.icon}>
          <PlotKindIcon kind={kind} size={18} />
        </span>
        <span className={classes.entryText}>
          <Text span inherit lineClamp={2} className={classes.entryTitle}>
            {name}
          </Text>
          <Text span inherit fz="xs" c="gray.6">
            {subtitle}
          </Text>
        </span>
      </UnstyledButton>
      <ActionIcon
        className={classes.entryClose}
        variant="subtle"
        color="gray"
        size="sm"
        aria-label={`Close ${label}`}
        onClick={onClose}
      >
        <IconX size={16} stroke={1.5} />
      </ActionIcon>
    </li>
  )
}

type PlotEntriesProps = {
  onSelect?: () => void
  empty?: ReactNode
}

// The open plots, each shown by its name and closed by its mark, in the nav
// and in the rail's Plots popover alike. A caller under a permanent header
// passes `empty` so the section says it is empty rather than leaving a gap.
function PlotEntries({ onSelect, empty }: PlotEntriesProps) {
  const dispatch = useAppDispatch()
  const views = useViews()
  const plots = usePlotEntries()

  if (plots.length === 0) {
    return empty ? <div className={classes.placeholder}>{empty}</div> : null
  }

  return (
    <ul className={classes.entries} aria-label="Plots">
      {plots.map(({ view, kind, name, subtitle, label }) => (
        <PlotEntry
          key={view.id}
          kind={kind}
          name={name}
          subtitle={subtitle}
          label={label}
          active={views.isActive(view)}
          onSelect={() => {
            views.select(view)
            onSelect?.()
          }}
          onClose={() => dispatch(removePlot(view.id))}
        />
      ))}
    </ul>
  )
}

export default PlotEntries
