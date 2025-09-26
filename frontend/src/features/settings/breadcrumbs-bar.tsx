import { Breadcrumbs, Text, Anchor } from '@mantine/core'
import { SettingsView } from './settings'

interface Props {
  currentView: SettingsView
  onNavigate: (view: SettingsView) => void
}

type Crumb = { label: string; to?: SettingsView }

const breadcrumbMap: Record<SettingsView, Crumb[]> = {
  main: [{ label: 'User settings' }],
  visibility: [{ label: 'User settings', to: 'main' }, { label: 'Visibility' }],
  'visibility-all': [
    { label: 'User settings', to: 'main' },
    { label: 'Visibility', to: 'visibility' },
    { label: 'By variable' },
  ],
  'visibility-tags': [
    { label: 'User settings', to: 'main' },
    { label: 'Visibility', to: 'visibility' },
    { label: 'By tag' },
  ],
}

export function BreadcrumbsBar({ currentView, onNavigate }: Props) {
  const crumbs = breadcrumbMap[currentView]

  return (
    <Breadcrumbs separator="›">
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1
        if (isLast || !c.to) {
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
