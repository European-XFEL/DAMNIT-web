import { Link } from 'react-router'
import { DEFAULT_THEME, Title } from '@mantine/core'

import styles from './logo.module.css'

type LogoProps = {
  linkTo: string
  compact?: boolean
}

function Logo({ linkTo, compact = false }: LogoProps) {
  return (
    <Link
      to={linkTo}
      className={styles.link}
      aria-label={compact ? 'DAMNIT!' : undefined}
    >
      {/* Arial is not optically small, so the logo takes Mantine's own h3
          size, without the theme's 6%. */}
      <Title
        order={1}
        variant="logo"
        fz={DEFAULT_THEME.headings.sizes.h3.fontSize}
        lh="h3"
      >
        {compact ? 'D!' : 'DAMNIT!'}
      </Title>
    </Link>
  )
}

export default Logo
