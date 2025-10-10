import { Divider, Flex, Group, rem, Text, UnstyledButton } from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'
import VisibilitySettings from './visibility-settings'

export type SettingsView =
  | 'main'
  | 'visibility'
  | 'visibility-all'
  | 'visibility-tags'

export type RenderCtx = {
  onNavegate: (v: SettingsView) => void
  hasTags: boolean
}

export type NavNode = {
  label: string
  view: SettingsView
  component: (ctx: RenderCtx) => React.ReactNode
  children?: NavNode[]
}

const settingsTree: NavNode = {
  label: 'Settings',
  view: 'main',
  component: ({ onNavegate }) => (
    <>
      <Divider label="" labelPosition="center" size="lg" />
      <UnstyledButton onClick={() => onNavegate('visibility')}>
        <Group justify="space-between">
          <Text>Visibility </Text>
          <IconChevronRight
            style={{ width: rem(20), height: rem(20) }}
            stroke={1.5}
          />
        </Group>
      </UnstyledButton>
      <Divider />
    </>
  ),
  children: [
    {
      label: 'Column Visibility',
      view: 'visibility',
      component: ({ onNavegate, hasTags }) => (
        <>
          <Divider
            label=" Column Visibility"
            labelPosition="center"
            size="lg"
          />
          <UnstyledButton onClick={() => onNavegate('visibility-all')}>
            <Group justify="space-between">
              <Text>By Variables </Text>
              <IconChevronRight
                style={{ width: rem(20), height: rem(20) }}
                stroke={1.5}
              />
            </Group>
          </UnstyledButton>
          <UnstyledButton
            disabled={!hasTags}
            onClick={() => onNavegate('visibility-tags')}
          >
            <Group justify="space-between">
              <Group>
                <Text size="md" c={!hasTags ? 'dimmed' : undefined}>
                  By Tags
                </Text>
              </Group>
              <IconChevronRight
                style={{ width: rem(20), height: rem(20) }}
                stroke={1.5}
              />
            </Group>
          </UnstyledButton>
          <Divider />
        </>
      ),
      children: [
        {
          label: 'By Variables',
          view: 'visibility-all',
          component: () => <VisibilitySettings variant="all-variables" />,
        },
        {
          label: 'By Tags',
          view: 'visibility-tags',
          component: () => (
            <>
              <Flex align="center" justify="between" gap="md" flex="column" />
              <VisibilitySettings variant="tag-variables" />
            </>
          ),
        },
      ],
    },
  ],
}

export const viewIndex: Record<SettingsView, NavNode> = {} as Record<
  SettingsView,
  NavNode
>
export const parentByView: Record<SettingsView, SettingsView | null> =
  {} as Record<SettingsView, SettingsView | null>

function buildIndex(root: NavNode) {
  const stack: Array<{ node: NavNode; parent: SettingsView | null }> = [
    { node: root, parent: null },
  ]
  while (stack.length) {
    const { node, parent } = stack.pop()!
    viewIndex[node.view] = node
    parentByView[node.view] = parent
    node.children?.forEach((child) =>
      stack.push({ node: child, parent: node.view })
    )
  }
}

buildIndex(settingsTree)

export function pathFromIndex(view: SettingsView): NavNode[] {
  const path: NavNode[] = []
  let v: SettingsView | null = view
  while (v) {
    path.push(viewIndex[v])
    v = parentByView[v]
  }
  return path.reverse()
}
