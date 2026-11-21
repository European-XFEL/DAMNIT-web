import { type ReactNode, useEffect, useState } from 'react'
import {
  Anchor,
  Box,
  Button,
  Card,
  Code,
  Container,
  Group,
  Image,
  List,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { Link, useLocation } from 'react-router'

import { CONTACT_EMAIL, HomePage } from '@damnit-frontend/ui'

import contextBuilderShot from '../assets/docs/docs-context-builder.jpg'
import flowMonitorShot from '../assets/docs/docs-flow-monitor.jpg'
import reviewMatchesShot from '../assets/docs/docs-review-matches.jpg'
import shotTableShot from '../assets/docs/docs-shot-table.jpg'
import { AppHeader } from '../components/AppHeader'

/** Long paths in inline code break instead of widening a phone screen. */
const WRAP = { overflowWrap: 'anywhere' } as const

/** The guide's sections, in order: the table of contents and the anchors. */
const SECTIONS = [
  { id: 'find-your-campaign', title: 'Find your campaign' },
  { id: 'shot-table', title: 'Read the shot table' },
  { id: 'shot-detail', title: 'Shot detail' },
  { id: 'own-columns', title: 'Your own columns (context)' },
  { id: 'review-matches', title: 'Review matches' },
  { id: 'campaign-file', title: 'The campaign file and SciCat' },
  { id: 'flow-monitor', title: 'Flow monitor' },
  { id: 'something-wrong', title: 'Something looks wrong' },
  { id: 'developers', title: 'For developers' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

// The fixed header is 40 px; a heading scrolled to stays below it.
const SCROLL_MARGIN = 64

function sectionTitle(id: SectionId) {
  return SECTIONS.find((section) => section.id === id)?.title ?? id
}

function DocSection({ id, children }: { id: SectionId; children: ReactNode }) {
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={`${id}-title`}
      style={{ scrollMarginTop: SCROLL_MARGIN }}
    >
      <Stack gap="xs">
        <Title order={3} id={`${id}-title`}>
          {sectionTitle(id)}
        </Title>
        {children}
      </Stack>
    </Box>
  )
}

function DocFigure({
  src,
  alt,
  caption,
}: {
  src: string
  alt: string
  caption: string
}) {
  return (
    <Box component="figure" m={0} maw={640}>
      <Image
        src={src}
        alt={alt}
        loading="lazy"
        radius={4}
        style={{ border: '1px solid var(--mantine-color-gray-3)' }}
      />
      <Text component="figcaption" size="xs" c="dimmed" mt={4}>
        {caption}
      </Text>
    </Box>
  )
}

/** Which section is in view, for the table of contents. */
function useCurrentSection(initial: SectionId) {
  const [current, setCurrent] = useState<SectionId>(initial)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return
    }
    const visible = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.isIntersecting)
        }
        const first = SECTIONS.find((section) => visible.get(section.id))
        if (first) {
          setCurrent(first.id)
        }
      },
      { rootMargin: `-${SCROLL_MARGIN}px 0px -60% 0px` }
    )
    for (const section of SECTIONS) {
      const element = document.getElementById(section.id)
      if (element) {
        observer.observe(element)
      }
    }
    return () => observer.disconnect()
  }, [])
  return [current, setCurrent] as const
}

function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((section) => section.id === value)
}

function TableOfContents({
  current,
  onPick,
}: {
  current: SectionId
  onPick: (id: SectionId) => void
}) {
  return (
    <Box
      component="nav"
      aria-label="On this page"
      visibleFrom="md"
      w={220}
      style={{
        position: 'sticky',
        top: SCROLL_MARGIN,
        flexShrink: 0,
        alignSelf: 'flex-start',
      }}
    >
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs">
        On this page
      </Text>
      <Stack gap={6}>
        {SECTIONS.map((section) => {
          const active = section.id === current
          return (
            <Anchor
              key={section.id}
              href={`#${section.id}`}
              size="sm"
              c={active ? undefined : 'dimmed'}
              fw={active ? 600 : 400}
              aria-current={active ? 'location' : undefined}
              onClick={() => onPick(section.id)}
            >
              {section.title}
            </Anchor>
          )
        })}
      </Stack>
    </Box>
  )
}

/**
 * The user guide for DAMNIT-web as HZDR runs it: how a shot arrives, how to
 * read and review it, and what to check when something looks wrong. Keep it
 * about the deployed flow (shot authority, watchdogs, LabFrog export, campaign
 * file, SciCat); developer setup lives in hzdr/docs/guides/operations.md.
 */
export function HZDRDocsPage() {
  const { hash } = useLocation()
  const requested = decodeURIComponent(hash.replace(/^#/, ''))
  const [current, setCurrent] = useCurrentSection(
    isSectionId(requested) ? requested : SECTIONS[0].id
  )

  // The router does not scroll to a hash on its own: /docs#review-matches
  // from another page lands on its section.
  useEffect(() => {
    if (!isSectionId(requested)) {
      return
    }
    setCurrent(requested)
    document.getElementById(requested)?.scrollIntoView?.({ block: 'start' })
  }, [requested, setCurrent])

  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container size="xl" py="xl">
          <Group align="flex-start" gap={48} wrap="nowrap">
            <Stack gap="xl" maw={860} style={{ flex: 1, minWidth: 0 }}>
              <Stack gap="lg">
                <Stack gap={4}>
                  <Title order={2}>Using DAMNIT-web at HZDR</Title>
                  <Text c="dimmed">
                    DAMNIT-web puts each campaign&apos;s shots together from
                    three sources, writes one campaign file, and registers it in
                    SciCat. This page shows how a shot gets here, how to read
                    and review it, and what to check when something looks wrong.
                  </Text>
                </Stack>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                  <Card withBorder radius={4} p="md">
                    <Stack gap="xs">
                      <Title order={4}>1. A shot happens</Title>
                      <Text size="sm">
                        The shot authority gives every DRACO trigger its shot
                        number. The DAQ File Watchdogs on the instrument PCs
                        report each new file. LabFrog&apos;s records are
                        exported every 15 minutes.
                      </Text>
                    </Stack>
                  </Card>
                  <Card withBorder radius={4} p="md">
                    <Stack gap="xs">
                      <Title order={4}>2. DAMNIT matches</Title>
                      <Text size="sm">
                        Events join a shot by their identity or the
                        authority&apos;s shot number, never by time alone. What
                        it cannot decide waits for you in Review matches.
                      </Text>
                    </Stack>
                  </Card>
                  <Card withBorder radius={4} p="md">
                    <Stack gap="xs">
                      <Title order={4}>3. The campaign file</Title>
                      <Text size="sm">
                        Every change rebuilds the campaign&apos;s NeXus file,
                        which is registered in SciCat with a summary of its
                        shots, targets and instruments.
                      </Text>
                    </Stack>
                  </Card>
                </SimpleGrid>
                <Group>
                  <Button component={Link} to="/home">
                    Open Campaigns
                  </Button>
                  <Button component={Link} to="/review-matches" variant="light">
                    Review matches
                  </Button>
                  <Button component={Link} to="/flow-monitor" variant="light">
                    Flow monitor
                  </Button>
                </Group>
              </Stack>

              <DocSection id="find-your-campaign">
                <Text size="sm">
                  Open <b>Campaigns</b> in the header (on a phone, the menu
                  button at the top left). The top of the page has the figures
                  at a glance (campaigns, shots today, decisions waiting, the
                  newest shot), <b>Continue with</b> the campaign you last
                  opened in this browser, and a short <i>How it works</i> beside
                  the list. The newest campaign comes first; type in{' '}
                  <b>Filter campaigns</b> to find one by name. Each row shows
                  the last shot, the number of shots and how many came today,
                  and what waits for you: decisions in Review matches (click the
                  chip to go there) and shots marked <i>Needs review</i> or{' '}
                  <i>Needs revision</i>.
                </Text>
                <Text size="sm">
                  Open a campaign for its shot table. One line above the table
                  links the campaign&apos;s SciCat dataset and wiki page and
                  shows which producers the catalog has seen.
                </Text>
                <Text size="sm" c="dimmed">
                  A campaign is named as in LabFrog (the wiki&apos;s beamtime
                  name, with underscores for spaces). Shots no record placed in
                  a campaign yet are under <b>Unassigned shots</b>.
                </Text>
              </DocSection>

              <DocSection id="shot-table">
                <List size="sm" spacing={4}>
                  <List.Item>
                    <b>Quick filters</b>: the <b>Needs review</b> and{' '}
                    <b>Needs revision</b> chips above the table show only those
                    shots. For anything else use the filter row.
                  </List.Item>
                  <List.Item>
                    <b>Choose columns</b> under Columns; <b>Add columns</b> next
                    to it makes new ones (see{' '}
                    <Anchor href="#own-columns">Your own columns</Anchor>).{' '}
                    <b>Move a column</b> by dragging its header onto another;{' '}
                    <b>Reset order</b> puts them back. Your choice is kept per
                    campaign in this browser.
                  </List.Item>
                  <List.Item>
                    <b>Sort</b> by clicking a header.
                  </List.Item>
                  <List.Item>
                    <b>Click a shot</b> to open it in Shot detail; the{' '}
                    <b>arrow keys</b> move to the shot above or below. The
                    address names the selected shot, and <b>Copy link</b> in
                    Shot detail copies a link that opens on it.
                  </List.Item>
                  <List.Item>
                    <b>Trends</b>, at the top of the side panel: pick a value to
                    plot it over the shots the table shows (the filters apply).
                    Click a point to open that shot.
                  </List.Item>
                  <List.Item>
                    <b>Click a cell</b> for its value; a number opens a trend
                    over the visible shots, a plot cell its full plot.
                  </List.Item>
                  <List.Item>
                    <b>Versions</b>: a LabFrog correction makes a new version of
                    a record; the table shows the current one. Two current
                    versions of one shot appear as a <i>version conflict</i> for
                    whoever owns the record to resolve in LabFrog. Tick{' '}
                    <i>Show older and archived versions</i> to see the history.
                  </List.Item>
                </List>
                <DocFigure
                  src={shotTableShot}
                  alt="A campaign's shot table with shot number, time, status, energy, target and image columns"
                  caption="The shot table of a demo campaign."
                />
              </DocSection>

              <DocSection id="shot-detail">
                <Text size="sm">
                  <b>Shot detail</b> sits beside the table and is open from the
                  start. It shows the selected shot: its events, the
                  target&apos;s wiki page and the datasets of this shot only.
                  Turn on the campaign file to browse the whole campaign file
                  instead.
                </Text>
                <Text size="sm">
                  A data product in the campaign file has a preview. Where its
                  dataset is stored the same way for every shot,{' '}
                  <b>Add as column</b> turns it into a column of your shot
                  table.
                </Text>
              </DocSection>

              <DocSection id="own-columns">
                <Text size="sm">
                  Each user has a <Code style={WRAP}>context.py</Code> per
                  campaign. Every <Code style={WRAP}>@Variable</Code> in it
                  becomes a column in your shot table. Press <b>Add columns</b>{' '}
                  next to Columns on the campaign page to build one (a metadata
                  value, an HDF5 summary, an image or plot preview), or write it
                  yourself:
                </Text>
                <Code block>
                  {`@Variable(title="Laser energy (mJ)")
def laser_energy_mj(run, laser_energy_j=None):
    if laser_energy_j is None:
        raise Skip("No laser energy for this shot")
    return laser_energy_j * 1000`}
                </Code>
                <Text size="sm">
                  <b>Help me choose</b> (where Add columns opens) lists what is
                  worth a column: values this campaign&apos;s shots record that
                  change from shot to shot, and the example shot&apos;s HDF5
                  images, lineouts and numbers. Each suggestion says why it was
                  picked and what the column will do. Tick the ones you want and
                  press <b>Add N columns</b> to save them to your context file
                  in one go. <b>Ignore this suggestion</b> hides one in this
                  browser; <b>Customise</b> opens it in the builder first.
                </Text>
                <Text size="sm">
                  The preview in the right-hand column shows a column before you
                  add it: the example shot&apos;s cell as the table will show
                  it, the image or curve a double-click opens, and the value
                  across the campaign. Below it, your existing columns are
                  listed: move them up or down, or delete one.{' '}
                  <b>Build a column myself</b> is the full builder; its preview
                  follows your choices as you make them.
                </Text>
                <DocFigure
                  src={contextBuilderShot}
                  alt="Help me choose: suggested columns, each with a reason, a preview and an add button"
                  caption="Help me choose suggests columns and previews them."
                />
                <Text size="sm">
                  <b>To start with</b>, your first context file for a campaign
                  has a few suggested columns: values the campaign&apos;s
                  LabFrog records hold that change from shot to shot (numbers
                  with units first, such as charge, dose or GVD). To get them in
                  an older file, open Add columns, then{' '}
                  <b>Manual context editor</b>, <b>Load suggested columns</b>,
                  check the text and press Save.
                </Text>
                <Text size="sm" c="dimmed">
                  A shot without the value a column needs shows <i>Missing</i>;
                  a value that is not a number shows in red, so a typo in
                  LabFrog is easy to spot.
                </Text>
                <Text size="sm" c="dimmed">
                  <b>Variants</b>: Save as keeps another version of the file
                  (for example a test). The shot table always uses the active
                  one, <Code style={WRAP}>context.py</Code>; choose a variant
                  under Context file and make it active to use it. The file it
                  replaces is kept as{' '}
                  <Code style={WRAP}>context_previous.py</Code>.
                </Text>
              </DocSection>

              <DocSection id="review-matches">
                <Text size="sm">
                  DAMNIT never attaches an event to a shot by time alone. When
                  it is unsure, the case waits on the Review matches page. It
                  opens on the campaign with the most waiting, and says{' '}
                  <b>All clear</b> when nothing does.
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
                <DocFigure
                  src={reviewMatchesShot}
                  alt="Review matches with the ambiguous, unassigned and unmatched lists"
                  caption="Review matches for a campaign with nothing waiting."
                />
              </DocSection>

              <DocSection id="campaign-file">
                <Text size="sm">
                  Each campaign has one NeXus file,{' '}
                  <Code style={WRAP}>
                    /bigdata/HPLexp/nexus/&lt;campaign&gt;/&lt;campaign&gt;.nxs
                  </Code>
                  . It holds one row per shot (
                  <Code style={WRAP}>/entry/shots</Code>), every event behind
                  them (<Code style={WRAP}>/entry/source_events</Code>) and the
                  record versions a correction replaced (
                  <Code style={WRAP}>/entry/labfrog_history</Code>). It is
                  rebuilt when a LabFrog export or new events change it.
                </Text>
                <Text size="sm">
                  Every build updates the campaign&apos;s SciCat dataset (same
                  PID each time) with a summary: shot and record counts, time
                  range, targets, instruments, match status and review state.
                  The dataset link is in the line above the shot table.
                </Text>
              </DocSection>

              <DocSection id="flow-monitor">
                <Text size="sm">
                  <b>Live</b> shows what is happening now: whether Kafka,
                  MongoDB and ASAPO answer, how many messages each topic holds,
                  and, as they arrive, triggers, watchdog events and spooled
                  events moving through the diagram. The page opens in Live
                  where live traffic is configured.
                </Text>
                <Text size="sm" c="dimmed">
                  <b>Demo</b> emulates the same flow with buttons, for showing
                  how it works; a banner marks it, and it does not touch the
                  real campaigns.
                </Text>
                <DocFigure
                  src={flowMonitorShot}
                  alt="The flow monitor diagram from producers through Kafka and ASAPO to DAMNIT-web"
                  caption="The flow monitor's diagram and traffic log."
                />
              </DocSection>

              <DocSection id="something-wrong">
                <List size="sm" spacing={4}>
                  <List.Item>
                    <b>A shot from LabFrog is missing</b>: the export runs every
                    15 minutes; wait one cycle, then check the record&apos;s
                    campaign in LabFrog.
                  </List.Item>
                  <List.Item>
                    <b>No new shots during a shot day</b>: open the flow monitor
                    in Live. If <Code style={WRAP}>draco.trigger</Code> does not
                    grow, the triggers are not reaching the shot authority.
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
                    Anything else: <b>Send feedback</b> (the mail button, bottom
                    right) or{' '}
                    <Anchor href={`mailto:${CONTACT_EMAIL}`}>
                      {CONTACT_EMAIL}
                    </Anchor>
                    .
                  </List.Item>
                </List>
              </DocSection>

              <DocSection id="developers">
                <Text size="sm">
                  The generated endpoint reference is the{' '}
                  <Anchor href="/api-docs">API reference</Anchor>. The server
                  runbook (deploying, rebuilding a campaign by hand) is{' '}
                  <Code style={WRAP}>hzdr/docs/guides/operations.md</Code> in
                  the repository.
                </Text>
              </DocSection>
            </Stack>
            <TableOfContents current={current} onPick={setCurrent} />
          </Group>
        </Container>
      }
    />
  )
}
