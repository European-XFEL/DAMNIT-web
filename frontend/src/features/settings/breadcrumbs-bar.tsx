import { Anchor, Breadcrumbs, Text } from '@mantine/core'
import { SettingsView, pathFromIndex } from './settings-config'

interface Props {
  currentView: SettingsView
  onNavigate: (view: SettingsView) => void
}

export function BreadcrumbsBar({ currentView, onNavigate }: Props) {
  const path = pathFromIndex(currentView)

  return (
    <Breadcrumbs separator="›">
      {path.map((node, i) => {
        const isLast = i === path.length - 1
        return isLast ? (
          <Text key={node.view}>{node.label}</Text>
        ) : (
          <Anchor
            key={node.view}
            href="#"
            c="black"
            fw={600}
            onClick={(e) => {
              e.preventDefault()
              onNavigate(node.view)
            }}
          >
            {node.label}
          </Anchor>
        )
      })}
    </Breadcrumbs>
  )
}
