import { Link } from 'react-router'
import { Card, Group, Stack, Text, Title } from '@mantine/core'

import { InstrumentBadge } from '@damnit-frontend/ui'

import classes from './examples.module.css'

export type ExampleInfo = {
  id: string
  title: string
  subtitle: string
  instrument: string
  principal_investigator: string
}

type ExampleCardProps = ExampleInfo

function ExampleCard(props: ExampleCardProps) {
  return (
    <Card
      withBorder
      shadow="xs"
      padding="xl"
      className={classes.card}
      component={Link}
      to={`/example/${props.id}`}
    >
      <Group justify="space-between" align="flex-start" gap="md">
        <Title order={4} style={{ lineHeight: 1.2, margin: 0 }}>
          {props.title}
        </Title>
        <InstrumentBadge instrument={props.instrument} />
      </Group>

      <Stack gap={6} mt="sm">
        <Text size="sm" c="dimmed" lineClamp={2} style={{ lineHeight: 1.45 }}>
          {props.subtitle}
        </Text>

        <Group gap="xs" c="dimmed">
          <Text
            size="xs"
            tt="uppercase"
            style={{ letterSpacing: 0.5, opacity: 0.7 }}
          >
            PI
          </Text>
          <Text size="xs" style={{ opacity: 0.9 }}>
            {props.principal_investigator}
          </Text>
        </Group>
      </Stack>
    </Card>
  )
}

type ExamplesProps = {
  items: ExampleInfo[]
}

function Examples({ items }: ExamplesProps) {
  return (
    <Stack>
      {items.map((item) => (
        <ExampleCard key={item.id} {...item} />
      ))}
    </Stack>
  )
}

export default Examples
