import type { ReactNode } from 'react'
import { Card, Container, Grid, List, Stack, Text, Title } from '@mantine/core'

import { HomePage } from '@damnit-frontend/ui'

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
 * Data rights and privacy notice for the HZDR-operated DAMNIT-web, worded
 * after LabFrog's (`labfrog/templates/privacy.html`): same controller, same
 * data protection officer. Public, like LabFrog's `/privacy`, so it can be
 * read before signing in. Keep "What we process" in step with what the API
 * actually stores (session user, review decisions, saved views, request log).
 */
export function HZDRPrivacyPage() {
  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container size="lg" py="xl">
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={2}>Data rights and privacy</Title>
              <Text c="dimmed">
                How DAMNIT-web at HZDR processes personal data to operate the
                service, and what you can ask for.
              </Text>
            </Stack>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, md: 8 }}>
                <Card withBorder radius={4} p="lg">
                  <Stack gap="lg">
                    <Section title="What we process">
                      <List size="sm" spacing={4}>
                        <List.Item>
                          <b>Your login</b>: the user name, name, e-mail address
                          and group memberships your sign-in provider supplies,
                          used to identify you and to check what you may see
                        </List.Item>
                        <List.Item>
                          <b>Review decisions you make</b>: a match you confirm,
                          correct or dismiss and a shot you assign to a campaign
                          are saved with your user name
                        </List.Item>
                        <List.Item>
                          <b>Table views you save</b>, stored under your user
                          name
                        </List.Item>
                        <List.Item>
                          <b>A session cookie</b> that keeps you signed in, and
                          the table layout your browser keeps in its local
                          storage
                        </List.Item>
                        <List.Item>
                          <b>Request logs</b>: the network address and the page
                          or API path of each request
                        </List.Item>
                      </List>
                      <Text size="sm" c="dimmed">
                        Shot records are shown as LabFrog and the instruments
                        recorded them. A name entered there appears here
                        unchanged.
                      </Text>
                    </Section>
                    <Section title="Purpose of processing">
                      <Text size="sm">
                        Data is processed only to provide, secure, and operate
                        DAMNIT-web, and to keep a record of who reviewed which
                        match. It is not used for advertising or third-party
                        tracking.
                      </Text>
                    </Section>
                    <Section title="Retention">
                      <List size="sm" spacing={4}>
                        <List.Item>
                          <b>Login details:</b> held in the session cookie until
                          you sign out or it expires (14 days); no account is
                          stored by DAMNIT-web
                        </List.Item>
                        <List.Item>
                          <b>Review decisions:</b> kept with the campaign&apos;s
                          data as part of its provenance
                        </List.Item>
                        <List.Item>
                          <b>Saved table views:</b> stored until you delete them
                        </List.Item>
                        <List.Item>
                          <b>Browser storage:</b> stays in your browser until
                          removed
                        </List.Item>
                      </List>
                    </Section>
                    <Section title="Your rights (GDPR)">
                      <Text size="sm">You may request:</Text>
                      <List size="sm" spacing={4}>
                        <List.Item>Access to your personal data</List.Item>
                        <List.Item>Correction of inaccurate data</List.Item>
                        <List.Item>Deletion of your data</List.Item>
                        <List.Item>
                          Restriction of or objection to processing, where
                          applicable
                        </List.Item>
                      </List>
                    </Section>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Stack gap="md">
                  <Card withBorder radius={4} p="lg">
                    <Section title="Controller">
                      <Text size="sm">
                        Helmholtz-Zentrum Dresden-Rossendorf e. V. (HZDR)
                        <br />
                        Bautzner Landstrasse 400, 01328 Dresden, Germany
                        <br />
                        E-mail: <a href="mailto:info@hzdr.de">info@hzdr.de</a>
                      </Text>
                    </Section>
                  </Card>
                  <Card withBorder radius={4} p="lg">
                    <Section title="Data Protection Officer">
                      <Text size="sm">
                        Kristin Beyer (LL.M.), Dresdner Institut fuer
                        Datenschutz
                        <br />
                        E-mail: <a href="mailto:dsb@hzdr.de">dsb@hzdr.de</a>
                      </Text>
                    </Section>
                  </Card>
                  <Text size="xs" c="dimmed">
                    These contacts are for the DAMNIT-web that HZDR operates.
                    Whoever runs another installation publishes a notice for
                    their own service.
                  </Text>
                </Stack>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      }
    />
  )
}
