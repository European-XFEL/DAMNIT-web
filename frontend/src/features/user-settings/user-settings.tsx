import {
  Divider,
  Stack,
  Text,
  UnstyledButton,
  Group,
  rem,
  Title,
  Flex,
  Breadcrumbs,
  Anchor,
} from '@mantine/core'
import { IconChevronRight, IconArrowLeft } from '@tabler/icons-react'
import { VisibilitySettings } from '../visibility-settings'
import { useState } from 'react'
import { useAppSelector } from '../../redux'
import { BreadcrumbsBar } from './breadcrumbs-bar'

export type SettingsView =
  | 'main'
  | 'visibility'
  | 'visibility-all'
  | 'visibility-tags'

function UserSettings() {
  const [currentView, setCurrentView] = useState<SettingsView>('main')

  const hasTags = useAppSelector(
    (state) => !!Object.keys(state.tableData.metadata.tags).length
  )

  if (currentView === 'visibility-all') {
    return (
      <Stack h="100%">
        <BreadcrumbsBar
          currentView={currentView}
          onNavigate={setCurrentView}
        />
        <VisibilitySettings variant="all-variables" />
      </Stack>
    )
  }

  if (currentView === 'visibility-tags') {
    return (
      <Stack h="100%">
        <BreadcrumbsBar
          currentView={currentView}
          onNavigate={setCurrentView}
        />
        <Flex align="center" justify="between" gap="md" flex="column"></Flex>
        <VisibilitySettings variant="tag-variables" />
      </Stack>
    )
  }

  if (currentView === 'visibility') {
    return (
      <Stack h="100%">
        <BreadcrumbsBar
          currentView={currentView}
          onNavigate={setCurrentView}
        />
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
      </Stack>
    )
  }

  return (
    <Stack>
      <BreadcrumbsBar
        currentView={currentView}
        onNavigate={setCurrentView}
      />
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
    </Stack>
  )
}

export default UserSettings
