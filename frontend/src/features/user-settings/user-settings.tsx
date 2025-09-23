import {
  Divider,
  Stack,
  Text,
  UnstyledButton,
  Group,
  rem,
  Title,
  Flex,
} from '@mantine/core'
import { IconChevronRight, IconArrowLeft } from '@tabler/icons-react'
import { VisibilitySettings } from '../visibility-settings'
import { useState } from 'react'
import { useAppSelector } from '../../redux'

function UserSettings() {
  type SettingsView = 'main' | 'visibility-all' | 'visibility-tags'

  const [currentView, setCurrentView] = useState<SettingsView>('main')

  const hasTags = useAppSelector(
    (state) => !!Object.keys(state.tableData.metadata.tags).length
  )

  const SettingsHeader = ({
    title,
    onBack,
    icon,
  }: {
    title: string
    onBack: () => void
    icon?: React.ReactNode
  }) => (
    <Group>
      <UnstyledButton onClick={onBack}>
        <IconArrowLeft
          style={{ width: rem(20), height: rem(20) }}
          stroke={1.5}
        />
      </UnstyledButton>
      <Title order={5}>{title}</Title>
      {icon}
    </Group>
  )

  if (currentView === 'visibility-all') {
    return (
      <Stack h="100%">
        <SettingsHeader
          title="Visibility by Variables"
          onBack={() => setCurrentView('main')}
        />
        <VisibilitySettings variant="all-variables" />
      </Stack>
    )
  }

  if (currentView === 'visibility-tags') {
    return (
      <Stack h="100%">
        <Flex align="center" justify="between" gap="md" flex="column">
          <SettingsHeader
            title="Visibility by Tag"
            onBack={() => setCurrentView('main')}
          />
        </Flex>
        <VisibilitySettings variant="tag-variables" />
      </Stack>
    )
  }

  return (
    <Stack>
      <Title order={4}>User Settings</Title>
      <Divider label=" Column Visibility" labelPosition="center" size="lg" />

      <UnstyledButton onClick={() => setCurrentView('visibility-all')}>
        <Group justify="space-between">
          <Text>Visibility by Variables</Text>
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
              Visibility by Tag
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

export default UserSettings
