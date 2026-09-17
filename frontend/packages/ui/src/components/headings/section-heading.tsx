import { type ReactNode } from 'react'
import { Text } from '@mantine/core'

export const mutedC =
  'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-0))'

export type SectionHeadingProps = {
  children: ReactNode
  size?: number
}

// The table popovers head their sections with it and the dashboard nav its
// groups, so every group label shares one treatment.
function SectionHeading({ children, size = 10 }: SectionHeadingProps) {
  return (
    <Text
      fz={size}
      fw={500}
      tt="uppercase"
      c={mutedC}
      style={{ letterSpacing: 0.8 }}
    >
      {children}
    </Text>
  )
}

export default SectionHeading
