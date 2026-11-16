import type { ReactNode } from 'react'
import {
  Anchor,
  Card,
  Container,
  Grid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { Link } from 'react-router'

import { CONTACT_EMAIL, HomePage } from '@damnit-frontend/ui'

import { AppHeader } from '../components/AppHeader'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <Title order={4}>{title}</Title>
      {children}
    </Stack>
  )
}

/**
 * Legal notice (imprint) for the HZDR-operated DAMNIT-web, worded after
 * LabFrog's local imprint (`labfrog/templates/imprint.html`): same service
 * provider, same general contact. Served by the app itself, so it works on
 * isolated lab machines, and public, like `/privacy`. Upstream's footer
 * linked European XFEL's notice, which does not cover this service.
 */
export function HZDRLegalPage() {
  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container size="lg" py="xl">
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={2}>Legal notice</Title>
              <Text c="dimmed">Who provides DAMNIT-web at HZDR.</Text>
            </Stack>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, md: 8 }}>
                <Card withBorder radius={4} p="lg">
                  <Stack gap="lg">
                    <Section title="Service provider">
                      <Text>
                        Helmholtz-Zentrum Dresden-Rossendorf e. V. (HZDR)
                        <br />
                        Bautzner Landstrasse 400
                        <br />
                        01328 Dresden, Germany
                      </Text>
                    </Section>
                    <Section title="This service">
                      <Text>
                        DAMNIT-web at HZDR is operated as an internal research
                        support application: it combines laser-shot records from
                        LabFrog, the shot authority and the instrument file
                        watchdogs into one campaign file per campaign, and shows
                        them for review.
                      </Text>
                      <Text>
                        It is HZDR&apos;s fork of DAMNIT-web by European XFEL,
                        used under the BSD 3-Clause License.{' '}
                        <Anchor
                          href="https://github.com/ktippey-hzdr/DAMNIT-web-hzdr"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Source code
                        </Anchor>
                        .
                      </Text>
                    </Section>
                    <Section title="Contact">
                      <Text>
                        General enquiries:{' '}
                        <Anchor href="mailto:info@hzdr.de">info@hzdr.de</Anchor>
                        <br />
                        Questions and feedback about this service:{' '}
                        <Anchor href={`mailto:${CONTACT_EMAIL}`}>
                          {CONTACT_EMAIL}
                        </Anchor>
                      </Text>
                    </Section>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Card withBorder radius={4} p="lg">
                  <Section title="Related">
                    <Text size="sm">
                      How this service processes personal data is in the{' '}
                      <Anchor component={Link} to="/privacy">
                        privacy notice
                      </Anchor>
                      .
                    </Text>
                  </Section>
                </Card>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      }
    />
  )
}
