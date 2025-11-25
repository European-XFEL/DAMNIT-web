import { useState, useEffect } from 'react'

import { Container } from '@mantine/core'
import Markdown from 'react-markdown'

function AboutPage() {
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    fetch('/docs/about.md')
      .then((res) => res.text())
      .then((text) => setContent(text))
      .catch((err) => {
        console.error('Failed to load markdown:', err)
      })
  }, [])

  console.log(content)

  if (!content) return null // or show a loader

  return (
    <Container size="md" my="xl">
      <Markdown>{content}</Markdown>
    </Container>
  )
}

export default AboutPage
