import { Breadcrumbs, Text, Anchor } from '@mantine/core'
import { SettingsView } from './user-settings'

interface Props {
  currentView: SettingsView
  onNavigate: (view: SettingsView) => void
}

export function BreadcrumbsBar({ currentView, onNavigate }: Props) {
  const crumbs =
    currentView === 'main'
      ? [{ label: 'User settings' as const }]
      : currentView === 'visibility'
        ? [
            { label: 'User settings' as const, to: 'main' as SettingsView },
            { label: 'Visibility' as const },
          ]
        : currentView === 'visibility-all'
          ? [
              { label: 'User settings' as const, to: 'main' as SettingsView },
              { label: 'Visibility' as const, to: 'visibility' as SettingsView },
              { label: 'By variable' as const },
            ]
          : [
              { label: 'User settings' as const, to: 'main' as SettingsView },
              { label: 'Visibility' as const, to: 'visibility' as SettingsView },
              { label: 'By tag' as const },
            ]

  return (
    <Breadcrumbs separator="›">
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1
        if (isLast || !('to' in c) || !c.to) {
          return (
            <Text key={`${c.label}-${i}`} c={isLast ? undefined : 'dimmed'}>
              {c.label}
            </Text>
          )
        }
        return (
          <Anchor
            key={`${c.label}-${i}`}
            href="#"
            c="black"
            fw={600}
            onClick={(e) => {
              e.preventDefault()
              onNavigate(c.to!)
            }}
          >
            {c.label}
          </Anchor>
        )
      })}
    </Breadcrumbs>
  )
}