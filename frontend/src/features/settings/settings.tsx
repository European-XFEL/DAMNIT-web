import {
  Divider,
  Stack,
  Text,
  UnstyledButton,
  Group,
  rem,
  Flex,
} from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'
import VisibilitySettings from './visibility-settings'
import { useState } from 'react'
import { useAppSelector } from '../../redux'
import { BreadcrumbsBar } from './breadcrumbs-bar'

export type SettingsView =
  | 'main'
  | 'visibility'
  | 'visibility-all'
  | 'visibility-tags'

const viewRenderers: Record<
  SettingsView,
  (ctx: {
    setCurrentView: (v: SettingsView) => void
    hasTags: boolean
  }) => React.ReactNode
> = {
  'visibility-all': () => <VisibilitySettings variant="all-variables" />,
  'visibility-tags': () => (
    <>
      <Flex align="center" justify="between" gap="md" flex="column" />
      <VisibilitySettings variant="tag-variables" />
    </>
  ),
  visibility: ({ setCurrentView, hasTags }) => (
    <>
      <Divider label=" Column Visibility" labelPosition="center" size="lg" />
      <UnstyledButton onClick={() => setCurrentView('visibility-all')}>
        <Group justify="space-between">
          <Text>By Variables</Text>
          <IconChevronRight
            style={{ width: rem(20), height: rem(20) }}
            stroke={1.5}
          />
        </Group>
      </UnstyledButton>
      <UnstyledButton
        disabled={!hasTags}
        onClick={() => setCurrentView('visibility-tags')}
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
  main: ({ setCurrentView }) => (
    <>
      <Divider label="" labelPosition="center" size="lg" />
      <UnstyledButton onClick={() => setCurrentView('visibility')}>
        <Group justify="space-between">
          <Text>Visibility</Text>
          <IconChevronRight
            style={{ width: rem(20), height: rem(20) }}
            stroke={1.5}
          />
        </Group>
      </UnstyledButton>
      <Divider />
    </>
  ),
}

function Settings() {
  const [currentView, setCurrentView] = useState<SettingsView>('main')
  const hasTags = useAppSelector(
    (state) => !!Object.keys(state.tableData.metadata.tags).length
  )

  return (
    <Stack h="100%">
      <BreadcrumbsBar currentView={currentView} onNavigate={setCurrentView} />
      {viewRenderers[currentView]({ setCurrentView, hasTags })}
    </Stack>
  )
}

export default Settings
