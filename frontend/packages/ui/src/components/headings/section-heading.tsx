import { Highlight } from '@mantine/core'

export const mutedC =
  'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-0))'

export type SectionHeadingProps = {
  id?: string
  children: string
  // What a find matched, for a heading that heads a group.
  highlight?: string
}

// Every group label shares this: the table popovers, the nav and the run panel.
// `size` rather than `fz`, which would leave the body's line height behind.
function SectionHeading({ id, children, highlight = '' }: SectionHeadingProps) {
  return (
    <Highlight
      id={id}
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
