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

function UserSettings() {
  type SettingsView =
    | 'main'
    | 'visibility'
    | 'visibility-all'
    | 'visibility-tags'

  const [currentView, setCurrentView] = useState<SettingsView>('main')

  const hasTags = useAppSelector(
    (state) => !!Object.keys(state.tableData.metadata.tags).length
  )

  const BreadcrumbBar = () => {
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
                {
                  label: 'Visibility' as const,
                  to: 'visibility' as SettingsView,
                },
                { label: 'By variable' as const },
              ]
            : [
                { label: 'User settings' as const, to: 'main' as SettingsView },
                {
                  label: 'Visibility' as const,
                  to: 'visibility' as SettingsView,
                },
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
                setCurrentView(c.to!)
              }}
            >
              {c.label}
            </Anchor>
          )
        })}
      </Breadcrumbs>
    )
  }

  if (currentView === 'visibility-all') {
    return (
      <Stack h="100%">
        <BreadcrumbBar />
        <VisibilitySettings variant="all-variables" />
      </Stack>
    )
  }

  if (currentView === 'visibility-tags') {
    return (
      <Stack h="100%">
        <BreadcrumbBar />
        <Flex align="center" justify="between" gap="md" flex="column"></Flex>
        <VisibilitySettings variant="tag-variables" />
      </Stack>
    )
  }

  if (currentView === 'visibility') {
    return (
      <Stack h="100%">
        <BreadcrumbBar />
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
      <BreadcrumbBar />
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
