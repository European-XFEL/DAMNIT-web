import { Link } from 'react-router'
import { Title } from '@mantine/core'

import styles from './logo.module.css'

type LogoProps = {
  linkTo: string
}

const Logo = ({ linkTo }: LogoProps) => {
  return (
    <Link to={linkTo} className={styles.link}>
      <Title order={1} style={{ fontFamily: 'Arial' }}>
        DAMNIT!
      </Title>
    </Link>
  )
}

export default Logo
