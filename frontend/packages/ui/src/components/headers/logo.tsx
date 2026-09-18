import { Link } from 'react-router'
import { Title } from '@mantine/core'

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
      <Title order={1} size="h3">
        {compact ? 'D!' : 'DAMNIT!'}
      </Title>
    </Link>
  )
}

export default Logo
