import { Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import { formatShotTime } from '../utils/format'

import type { HomeCampaignSummary } from './homeCampaignSummary'

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function CampaignRow({ campaign }: { campaign: HomeCampaignSummary }) {
  const reviewLink = `/review-matches?source=${encodeURIComponent(campaign.key)}`
  return (
    <Card withBorder radius={4} p="sm" data-testid="home-campaign-row">
      <Group justify="space-between" align="flex-start" gap="sm">
        <Stack gap={2} style={{ minWidth: 0, flex: '1 1 220px' }}>
          <Anchor
            component={Link}
            to={`/source/${encodeURIComponent(campaign.key)}`}
            fw={600}
          >
            {campaign.title}
          </Anchor>
          <Text size="sm" c="dimmed">
            Last shot {formatShotTime(campaign.lastShotAt)}
          </Text>
          <Text
            size="xs"
            c="dimmed"
            truncate="end"
            title={`DAMNIT folder: ${campaign.damnitPath}`}
          >
            {campaign.damnitPath}
          </Text>
        </Stack>
        <Group gap={6} justify="flex-end">
          <Badge variant="light" color="gray">
            {plural(campaign.shotCount, 'shot', 'shots')}
          </Badge>
          {campaign.firedToday > 0 ? (
            <Badge variant="light" color="teal">
              +{campaign.firedToday} today
            </Badge>
          ) : null}
          {campaign.waiting > 0 ? (
            <Badge
              component={Link}
              to={reviewLink}
              variant="light"
              color="orange"
              style={{ cursor: 'pointer' }}
            >
              {campaign.waiting} waiting in Review matches
            </Badge>
          ) : null}
          {campaign.needsReview > 0 ? (
            <Badge variant="light" color="yellow">
              {plural(
                campaign.needsReview,
                'shot needs review',
                'shots need review'
              )}
            </Badge>
          ) : null}
          {campaign.needsRevision > 0 ? (
            <Badge variant="light" color="red">
              {plural(
                campaign.needsRevision,
                'shot needs revision',
                'shots need revision'
              )}
            </Badge>
          ) : null}
        </Group>
      </Group>
    </Card>
  )
}

export function HomeCampaignList({
  campaigns,
}: {
  campaigns: HomeCampaignSummary[]
}) {
  return (
    <Stack gap="xs">
      {campaigns.map((campaign) => (
        <CampaignRow key={campaign.key} campaign={campaign} />
      ))}
    </Stack>
  )
}
