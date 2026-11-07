import { useNavigate } from 'react-router'
import { Container, Title } from '@mantine/core'

import MainNavButton from '#src/components/buttons/main-nav-button'

import styles from './not-found-page.module.css'

type NotFoundPageProps = { homeTo?: string }

function NotFoundPage({ homeTo = '/home' }: NotFoundPageProps) {
  const navigate = useNavigate()

  return (
    <Container
      mt="xl"
      size="md"
      style={{
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <Title order={1} size="h2">
          DAMNIT! Page not found.
        </Title>
        <div className={styles.controls}>
          <MainNavButton variant="filled" onClick={() => navigate(homeTo)}>
            Return home
          </MainNavButton>
        </div>
      </div>
    </Container>
  )
}

export default NotFoundPage
