import { Container, Title } from '@mantine/core'

import { history } from '#src/lib/history'
import MainNavButton from '#src/components/buttons/main-nav-button'

import styles from './not-found-page.module.css'

const NotFoundPage = () => {
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
        <Title order={2}>DAMNIT! Page not found.</Title>
        <div className={styles.controls}>
          <MainNavButton
            variant="filled"
            onClick={() => history.navigate('/home')}
          >
            Return home
          </MainNavButton>
        </div>
      </div>
    </Container>
  )
}

export default NotFoundPage
