import { Anchor, Breadcrumbs, Text } from '@mantine/core'
import { NavNode, SettingsView, pathFromIndex } from './settings-config'

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
      <Text key={node.view} aria-current="page">
        {node.label}
      </Text>
    )
  }

  return (
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
}

export function BreadcrumbsBar({ currentView, onNavigate }: Props) {
  const path = pathFromIndex(currentView)

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
