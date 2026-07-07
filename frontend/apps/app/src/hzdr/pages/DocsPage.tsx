import {
  Button,
  Card,
  Code,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { Link } from 'react-router'
import { HomePage } from '@damnit-frontend/ui'
import { AppHeader } from '../components/AppHeader'
import { DetailsSection } from '../components/ShotTable'

export function HZDRDocsPage() {
  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container size="lg" py="xl">
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={2}>DAMNIT-web HZDR workflow</Title>
              <Text c="dimmed">
                Start with the short path, then expand the sections that match
                what you are trying to understand or debug.
              </Text>
            </Stack>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>1. Produce</Title>
                  <Text size="sm">
                    LaserData creates new shots through the ASAPO path. Watchdog
                    events enrich the latest shot through Kafka.
                  </Text>
                </Stack>
              </Card>
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>2. Stage</Title>
                  <Text size="sm">
                    Normalized packages are appended to JSONL staging by
                    experiment and shot id.
                  </Text>
                </Stack>
              </Card>
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>3. Inspect</Title>
                  <Text size="sm">
                    DAMNIT-web reads sources, context columns, trends, and HDF5
                    previews from the generated stream.
                  </Text>
                </Stack>
              </Card>
            </SimpleGrid>
            <Group>
              <Button component={Link} to="/flow-monitor">
                Flow monitor
              </Button>
              <Button component={Link} to="/home" variant="light">
                Workspace
              </Button>
              <Button component="a" href="/api-docs" variant="light">
                API docs
              </Button>
            </Group>
            <Stack gap="sm">
              <DetailsSection title="Quick start" open>
                <Stack gap="xs">
                  <Text size="sm">
                    Create `hzdr/scripts/hzdr-launch.config.json`, start the
                    launcher, open the workspace, then use the flow monitor to
                    send test Shotcounter and Watchdog traffic.
                  </Text>
                  <Code block>
                    bash hzdr/scripts/hzdr-launch.sh --init-config{'\n'}
                    bash hzdr/scripts/hzdr-launch.sh{'\n\n'}
                    powershell -NoProfile -ExecutionPolicy Bypass -File
                    .\hzdr\scripts\hzdr-launch.ps1 -InitConfig{'\n'}
                    powershell -NoProfile -ExecutionPolicy Bypass -File
                    .\hzdr\scripts\hzdr-launch.ps1
                  </Code>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Data boundaries">
                <Stack gap="xs">
                  <Text size="sm">
                    LaserData creates new shots. Watchdog/Kafka enriches the
                    latest shot. Additional enrichment data follows the same
                    staged-event path. The HDF5 builder consumes staged JSONL
                    package events, not MongoDB.
                  </Text>
                  <Text size="sm" c="dimmed">
                    MongoDB remains the live source for shot metadata and
                    context joins. The package stream is the combine boundary.
                  </Text>
                  <Text size="sm" c="dimmed">
                    JSONL is live staging. HDF5 appears only after a build or
                    finalize trigger reads staged packages and writes the
                    combined experiment file.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="JSONL to HDF5 trigger">
                <Stack gap="xs">
                  <Text size="sm">
                    In the emulator, the flow monitor's Build HDF5 button stands
                    in for the production builder trigger.
                  </Text>
                  <Text size="sm" c="dimmed">
                    In production, that trigger should come from the operational
                    package-builder path: a run-close hook, shot-set-complete
                    signal, scheduled builder job, or broker message. DAMNIT
                    should read the resulting HDF5; it should not be the thing
                    deciding how staged packages are combined.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Launcher and connections">
                <Stack gap="xs">
                  <Text size="sm">
                    DAQ File Watchdog, LabFrog, Kafka, ASAPO, and MongoDB live
                    together in the shared launcher config so the emulator can
                    be converted toward real services without moving settings
                    around.
                  </Text>
                  <Code block>
                    hzdr/scripts/hzdr-launch.config.json{'\n'}
                    hzdr/scripts/hzdr-launch.config.example.json
                  </Code>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Source table">
                <Stack gap="xs">
                  <Text size="sm">
                    The source table starts with fixed shot metadata, then adds
                    active context columns from `context.py`.
                  </Text>
                  <Text size="sm" c="dimmed">
                    Numeric cells open trends automatically. Plot-backed context
                    cells show an inline sparkline and render the full Plotly
                    preview in the selected-cell panel.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Context builder">
                <Stack gap="xs">
                  <Text size="sm">
                    Context files are saved per source and user. Single-input
                    modes are used for metadata, HDF5 summaries, image/lineout
                    previews, Plotly previews, and Mongo queries.
                  </Text>
                  <Text size="sm" c="dimmed">
                    Multi-input selection is reserved for custom functions where
                    combining several values is expected.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Verification">
                <Stack gap="xs">
                  <Text size="sm">
                    Use the watchdog verifier when you need to test Kafka first
                    and fall back through ASAPO/local broker and MongoDB.
                  </Text>
                  <Code block>
                    cd api{'\n'}# use `uv run` for local/dev verification
                    scripts uv run python scripts/verify-hzdr-watchdog.py
                    --config ..\hzdr\scripts\hzdr-launch.config.json --mode auto
                  </Code>
                </Stack>
              </DetailsSection>
              <DetailsSection title="API reference">
                <Stack gap="xs">
                  <Text size="sm">
                    This page is the expandable HZDR workflow guide. Use the API
                    reference when you need the generated backend endpoint docs.
                  </Text>
                  <Button component="a" href="/api-docs" variant="light">
                    Open API reference
                  </Button>
                </Stack>
              </DetailsSection>
            </Stack>
          </Stack>
        </Container>
      }
    />
  )
}
