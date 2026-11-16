import {
  Anchor,
  Button,
  Card,
  Code,
  Container,
  Group,
  List,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { Link } from 'react-router'

import { CONTACT_EMAIL, HomePage } from '@damnit-frontend/ui'

import { AppHeader } from '../components/AppHeader'
import { DetailsSection } from '../components/ShotTable'

/**
 * The user guide for DAMNIT-web as HZDR runs it: how a shot arrives, how to
 * read and review it, and what to check when something looks wrong. Keep it
 * about the deployed flow (shot authority, watchdogs, LabFrog export, campaign
 * file, SciCat); developer commands stay in the last, collapsed section.
 */
export function HZDRDocsPage() {
  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container size="lg" py="xl">
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={2}>Using DAMNIT-web at HZDR</Title>
              <Text c="dimmed">
                DAMNIT-web puts each campaign&apos;s shots together from three
                sources, writes one campaign file, and registers it in SciCat.
                This page shows how a shot gets here, how to read and review it,
                and what to check when something looks wrong.
              </Text>
            </Stack>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>1. A shot happens</Title>
                  <Text size="sm">
                    The shot authority gives every DRACO trigger its shot
                    number. The DAQ File Watchdogs on the instrument PCs report
                    each new file. LabFrog&apos;s records are exported every 15
                    minutes.
                  </Text>
                </Stack>
              </Card>
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>2. DAMNIT matches</Title>
                  <Text size="sm">
                    Events join a shot by their identity or the authority&apos;s
                    shot number, never by time alone. What it cannot decide
                    waits for you in Review matches.
                  </Text>
                </Stack>
              </Card>
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>3. The campaign file</Title>
                  <Text size="sm">
                    Every change rebuilds the campaign&apos;s NeXus file, which
                    is registered in SciCat with a summary of its shots, targets
                    and instruments.
                  </Text>
                </Stack>
              </Card>
            </SimpleGrid>
            <Group>
              <Button component={Link} to="/home">
                Find a campaign
              </Button>
              <Button component={Link} to="/review-matches" variant="light">
                Review matches
              </Button>
              <Button component={Link} to="/flow-monitor" variant="light">
                Flow monitor
              </Button>
            </Group>
            <Stack gap="sm">
              <DetailsSection title="Find your campaign" open>
                <Stack gap="xs">
                  <Text size="sm">
                    Open <b>Workspace</b> and choose the campaign under Sources.
                    Its page has the shot table and, at the top, the campaign
                    file&apos;s location, its SciCat dataset and the
                    campaign&apos;s wiki page. Click a shot to see its details,
                    the events attached to it, the target&apos;s wiki page and
                    previews of its data.
                  </Text>
                  <Text size="sm" c="dimmed">
                    A campaign is named as in LabFrog (the wiki&apos;s beamtime
                    name, with underscores for spaces). Shots no record placed
                    in a campaign yet are under <b>Unassigned shots</b>.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Read the shot table">
                <Stack gap="xs">
                  <List size="sm" spacing={4}>
                    <List.Item>
                      <b>Choose columns</b> under Columns. <b>Move a column</b>{' '}
                      by dragging its header onto another; <b>Reset order</b>{' '}
                      puts them back. Your choice is kept per campaign in this
                      browser.
                    </List.Item>
                    <List.Item>
                      <b>Sort</b> by clicking a header; <b>filter</b> with the
                      filter row above the table.
                    </List.Item>
                    <List.Item>
                      <b>Click a cell</b> for its value; a number opens a trend
                      over the visible shots, a plot cell its full plot.
                    </List.Item>
                    <List.Item>
                      <b>Versions</b>: a LabFrog correction makes a new version
                      of a record; the table shows the current one. Two current
                      versions of one shot appear as a <i>version conflict</i>{' '}
                      for whoever owns the record to resolve in LabFrog. Tick
                      <i> Show older and archived versions</i> to see the
                      history.
                    </List.Item>
                  </List>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Your own columns (context)">
                <Stack gap="xs">
                  <Text size="sm">
                    Each user has a <Code>context.py</Code> per campaign. Every{' '}
                    <Code>@Variable</Code> in it becomes a column in your shot
                    table. Build one in <b>Context</b> on the campaign page
                    (pick a metadata value, an HDF5 summary, an image or plot
                    preview), or write it yourself:
                  </Text>
                  <Code block>
                    {`@Variable(title="Laser energy (mJ)")
def laser_energy_mj(run, laser_energy_j=None):
    if laser_energy_j is None:
        raise Skip("No laser energy for this shot")
    return laser_energy_j * 1000`}
                  </Code>
                  <Text size="sm">
                    <b>To start with</b>, your first context file for a campaign
                    has a few suggested columns: values the campaign&apos;s
                    LabFrog records hold that change from shot to shot (numbers
                    with units first, such as charge, dose or GVD). To get them
                    in an older file, open Context, then{' '}
                    <b>Manual context editor</b> → <b>Load suggested columns</b>
                    , check the text and press Save. Delete any column you do
                    not need the same way.
                  </Text>
                  <Text size="sm" c="dimmed">
                    A shot without the value a column needs shows <i>Missing</i>
                    ; a value that is not a number shows in red, so a typo in
                    LabFrog is easy to spot.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Review matches">
                <Stack gap="xs">
                  <Text size="sm">
                    DAMNIT never attaches an event to a shot by time alone. When
                    it is unsure, the case waits on the Review matches page:
                  </Text>
                  <List size="sm" spacing={4}>
                    <List.Item>
                      <b>Ambiguous</b>: an event fits several shots. Compare its
                      number and time with the candidates and confirm one only
                      when the evidence fits.
                    </List.Item>
                    <List.Item>
                      <b>Unmatched</b>: an event fits no shot. Acknowledge it if
                      it is not a shot.
                    </List.Item>
                    <List.Item>
                      <b>Unassigned</b>: a shot no LabFrog record or campaign
                      schedule placed in a campaign. Assign its campaign.
                    </List.Item>
                  </List>
                  <Text size="sm" c="dimmed">
                    Each decision is saved with your name and kept across
                    rebuilds. Leaving a case alone is always safe.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="The campaign file and SciCat">
                <Stack gap="xs">
                  <Text size="sm">
                    Each campaign has one NeXus file,{' '}
                    <Code>
                      /bigdata/HPLexp/nexus/&lt;campaign&gt;/&lt;campaign&gt;.nxs
                    </Code>
                    . It holds one row per shot (<Code>/entry/shots</Code>),
                    every event behind them (<Code>/entry/source_events</Code>)
                    and the record versions a correction replaced (
                    <Code>/entry/labfrog_history</Code>). It is rebuilt when a
                    LabFrog export or new events change it.
                  </Text>
                  <Text size="sm">
                    Every build updates the campaign&apos;s SciCat dataset (same
                    PID each time) with a summary: shot and record counts, time
                    range, targets, instruments, match status and review state.
                    The dataset link is at the top of the campaign page.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Flow monitor">
                <Stack gap="xs">
                  <Text size="sm">
                    <b>Live</b> shows what is happening now: whether Kafka,
                    MongoDB and ASAPO answer, how many messages each topic
                    holds, and, as they arrive, triggers, watchdog events and
                    spooled events moving through the diagram.
                  </Text>
                  <Text size="sm" c="dimmed">
                    <b>Demo</b> emulates the same flow with buttons, for showing
                    how it works; it does not touch the real campaigns.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Something looks wrong">
                <List size="sm" spacing={4}>
                  <List.Item>
                    <b>A shot from LabFrog is missing</b>: the export runs every
                    15 minutes; wait one cycle, then check the record&apos;s
                    campaign in LabFrog.
                  </List.Item>
                  <List.Item>
                    <b>No new shots during a shot day</b>: open the flow monitor
                    in Live. If <Code>draco.trigger</Code> does not grow, the
                    triggers are not reaching the shot authority.
                  </List.Item>
                  <List.Item>
                    <b>An event is not on its shot</b>: look in Review matches;
                    it may be waiting for a decision.
                  </List.Item>
                  <List.Item>
                    <b>A column says Missing</b>: those shots do not have the
                    value its context variable needs.
                  </List.Item>
                  <List.Item>
                    Anything else: <b>Send feedback</b> (bottom right) or{' '}
                    <Anchor href={`mailto:${CONTACT_EMAIL}`}>
                      {CONTACT_EMAIL}
                    </Anchor>
                    .
                  </List.Item>
                </List>
              </DetailsSection>
              <DetailsSection title="For developers">
                <Stack gap="xs">
                  <Text size="sm">
                    The generated endpoint reference is the{' '}
                    <Anchor href="/api-docs">API reference</Anchor>. To run the
                    whole stack locally with an emulated broker:
                  </Text>
                  <Code block>
                    {`bash hzdr/scripts/hzdr-launch.sh --init-config
bash hzdr/scripts/hzdr-launch.sh

powershell -NoProfile -ExecutionPolicy Bypass -File .\\hzdr\\scripts\\hzdr-launch.ps1 -InitConfig
powershell -NoProfile -ExecutionPolicy Bypass -File .\\hzdr\\scripts\\hzdr-launch.ps1`}
                  </Code>
                  <Text size="sm" c="dimmed">
                    Settings live in{' '}
                    <Code>hzdr/scripts/hzdr-launch.config.json</Code> (example
                    beside it). To check a watchdog&apos;s transport from{' '}
                    <Code>api/</Code>:{' '}
                    <Code>
                      uv run python scripts/verify-hzdr-watchdog.py --config
                      ../hzdr/scripts/hzdr-launch.config.json --mode auto
                    </Code>
                    . The server runbook is{' '}
                    <Code>hzdr/docs/guides/operations.md</Code> in the
                    repository.
                  </Text>
                </Stack>
              </DetailsSection>
            </Stack>
          </Stack>
        </Container>
      }
    />
  )
}
