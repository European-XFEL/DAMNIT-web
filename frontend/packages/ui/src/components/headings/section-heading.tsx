import { Highlight } from '@mantine/core'

export const mutedC =
  'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-0))'

export type SectionHeadingProps = {
  children: string
  // What a find matched, for a heading that heads a group.
  highlight?: string
}

// Every group label, in the table popovers and the dashboard nav, shares this.
// `size` rather than `fz`, which would leave the body's line height behind.
function SectionHeading({ children, highlight = '' }: SectionHeadingProps) {
  return (
    <Highlight
      highlight={highlight}
      size="xxs"
      fw={500}
      tt="uppercase"
      c={mutedC}
      lts="0.06em"
    >
      {children}
    </Highlight>
  )
}

export default SectionHeading
