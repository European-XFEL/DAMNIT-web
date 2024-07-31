import React from "react"

import { Stack, Text } from "@mantine/core"

import { ContextMenuItem as MantineContextMenuItem } from "mantine-contextmenu"

const ContextMenuItem = ({ title, subtitle, ...props }) => {
  return (
    <MantineContextMenuItem
      // key={key}
      title={
        <Stack gap={0}>
          <Text size="sm">{title}</Text>
          {subtitle && (
            <Text size="xs" c="dark.5">
              {subtitle}
            </Text>
          )}
        </Stack>
      }
      onHide={() => {}}
      {...props}
    />
  )
}

export default ContextMenuItem
