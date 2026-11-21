import {
  Anchor,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  IconArrowRight,
  IconColumns,
  IconListCheck,
  IconTable,
} from '@tabler/icons-react'
import { Link } from 'react-router'

import { formatShotTime } from '../utils/format'

import { type HomeCampaignSummary, homeGlance } from './homeCampaignSummary'

function Figure({
  label,
  value,
  detail,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
}) {
  return (
    <Stack gap={0} miw={0}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4}>
        {label}
      </Text>
      <Text fw={700} fz="lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Text>
      {detail ? (
        <Text size="xs" c="dimmed" truncate="end">
          {detail}
        </Text>
      ) : null}
    </Stack>
  )
}

/**
 * The top of Home: what DAMNIT-web is for, the campaign figures at a glance,
 * and a way back to the campaign last opened in this browser.
 */
export function HomeWelcome({
  campaigns,
  lastCampaignKey,
}: {
  campaigns: HomeCampaignSummary[]
  lastCampaignKey: string | null
}) {
  const glance = homeGlance(campaigns)
  const last = campaigns.find((campaign) => campaign.key === lastCampaignKey)
  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="sm">
          <Stack gap={4} maw={640}>
            <Title order={2}>DAMNIT-web at HZDR</Title>
            <Text size="sm" c="dimmed">
              Each campaign's DRACO shots in one table: LabFrog records,
              triggers and instrument files joined by shot number, with your own
              columns and previews beside them.
            </Text>
          </Stack>
          {last ? (
            <Button
              component={Link}
              to={`/source/${encodeURIComponent(last.key)}`}
              rightSection={<IconArrowRight size={16} />}
              variant="light"
            >
              Continue with {last.title}
            </Button>
          ) : null}
        </Group>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <Figure
            label="Campaigns"
            value={glance.campaigns}
            detail={`${glance.shots} shots in all`}
          />
          <Figure
            label="Shots today"
            value={glance.today}
            detail={glance.today ? 'across all campaigns' : 'none yet today'}
          />
          <Figure
            label="Waiting for a decision"
            value={glance.waiting}
            detail={
              glance.busiest ? (
                <Anchor
                  component={Link}
                  to={`/review-matches?source=${encodeURIComponent(glance.busiest.key)}`}
                  size="xs"
                >
                  Open Review matches
                </Anchor>
              ) : (
                'nothing to review'
              )
            }
          />
          <Figure
            label="Newest shot"
            value={
              glance.newest ? formatShotTime(glance.newest.lastShotAt) : '-'
            }
            detail={
              glance.newest ? (
                <Anchor
                  component={Link}
                  to={`/source/${encodeURIComponent(glance.newest.key)}`}
                  size="xs"
                >
                  {glance.newest.title}
                </Anchor>
              ) : (
                'no shots yet'
              )
            }
          />
        </SimpleGrid>
      </Stack>
    </Card>
  )
}

const STEPS = [
  {
    icon: IconTable,
    title: 'Open a campaign',
    text: 'Every shot is a row. Click a cell for its value or preview; Trends plots any value over the shots shown.',
    link: { to: '/docs#shot-table', label: 'Reading the shot table' },
  },
  {
    icon: IconColumns,
    title: 'Add your own columns',
    text: 'On a campaign, Add columns suggests values worth a column; tick the ones you want, or build one from any field or dataset.',
    link: { to: '/docs#own-columns', label: 'Your own columns' },
  },
  {
    icon: IconListCheck,
    title: 'Settle what DAMNIT will not guess',
    text: 'An event that fits several shots, or none, waits in Review matches until a person decides.',
    link: { to: '/docs#review-matches', label: 'Review matches' },
  },
]

/** Three steps beside the campaign list for someone new, each with its guide. */
export function HomeGuide() {
  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="md">
        <Title order={4}>How it works</Title>
        {STEPS.map((step) => (
          <Group key={step.title} gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon variant="light" size="md" radius="sm">
              <step.icon size={16} />
            </ThemeIcon>
            <Stack gap={2} miw={0}>
              <Text fw={600} size="sm">
                {step.title}
              </Text>
              <Text size="sm" c="dimmed">
                {step.text}
              </Text>
              <Anchor component={Link} to={step.link.to} size="xs">
                {step.link.label}
              </Anchor>
            </Stack>
          </Group>
        ))}
        <Text size="xs" c="dimmed">
          Shots not arriving? The{' '}
          <Anchor component={Link} to="/flow-monitor" size="xs">
            Flow monitor
          </Anchor>{' '}
          shows each producer&apos;s traffic. Everything else is in the{' '}
          <Anchor component={Link} to="/docs" size="xs">
            Docs
          </Anchor>
          .
        </Text>
      </Stack>
    </Card>
  )
}
