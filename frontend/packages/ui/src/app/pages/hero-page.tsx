import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Container, Title } from '@mantine/core'

import classes from './hero-page.module.css'

const HeroPage = () => {
  const navigate = useNavigate()

  useEffect(() => {
    setTimeout(() => {
      navigate('/home')
    }, 2000)
  }, [navigate])

  return (
    <Container className={classes.container} size="md">
      <Title variant="logo" className={classes.title}>
        DAMNIT!
      </Title>
    </Container>
  )
}

export default HeroPage
