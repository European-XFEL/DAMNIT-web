import { Anchor, Breadcrumbs, Text } from '@mantine/core'
import { type NavNode, type SettingsView, pathForView } from './settings-config'

interface Props {
  currentView: SettingsView
  onNavigate: (view: SettingsView) => void
}

function Crumb({
  node,
  active,
  onNavigate,
}: {
  node: NavNode
  active: boolean
  onNavigate: (view: SettingsView) => void
}) {
  if (active) {
    return (
      <Text key={node.view} aria-current="page" size="sm" fw={700}>
        {node.label}
      </Text>
    )
  }

  return (
    <Anchor
      key={node.view}
      href="#"
      size="sm"
      onClick={(e) => {
        e.preventDefault()
        onNavigate(node.view)
      }}
      c="indigo"
    >
      {node.label}
    </Anchor>
  )
}

export function BreadcrumbsBar({ currentView, onNavigate }: Props) {
  const path = pathForView(currentView)
  return (
    <Breadcrumbs separator="›">
      {path.map((node, i) => {
        const isLast = i === path.length - 1
        return (
          <Crumb
            key={node.view}
            node={node}
            active={isLast}
            onNavigate={onNavigate}
          />
        )
      })}
    </Breadcrumbs>
  )
}
