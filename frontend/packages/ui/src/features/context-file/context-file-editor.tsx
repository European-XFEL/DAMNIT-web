import { useEffect, useLayoutEffect, useRef } from 'react'
import { Editor as Monaco, type OnMount } from '@monaco-editor/react'

import CenteredLoader from '#src/components/feedback/centered-loader'
import { useAppDispatch, useAppStore } from '#src/app/store/hooks'

import { setView } from './context-file.slice'

type MonacoEditor = Parameters<OnMount>[0]

function isFindShortcut(event: KeyboardEvent) {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'f'
  )
}

interface ContextFileEditorProps {
  content?: string
}

const ContextFileEditor = ({ content }: ContextFileEditorProps) => {
  const dispatch = useAppDispatch()
  const store = useAppStore()
  const editorRef = useRef<MonacoEditor | null>(null)

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    const savedView = store.getState().contextFile.view
    if (savedView) {
      editor.restoreViewState(savedView)
    }
  }

  // Ctrl+F searches the file from anywhere on the view: Monaco draws only the
  // lines on screen, so the browser's own find would miss the rest.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const editor = editorRef.current
      if (editor == null || event.defaultPrevented || !isFindShortcut(event)) {
        return
      }
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"]')
      ) {
        return
      }

      event.preventDefault()
      // The find action only runs while the editor has focus.
      editor.focus()
      void editor.getAction('actions.find')?.run()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Save the view state in a layout-effect cleanup to avoid race with a parent
  // useEffect cleanup (e.g. resetProposal on proposal change).
  useLayoutEffect(() => {
    return () => {
      const viewState = editorRef.current?.saveViewState()
      if (viewState) {
        dispatch(setView(viewState))
      }
    }
  }, [dispatch])

  return (
    <Monaco
      theme="vs-light"
      options={{
        fontSize: 14,
        padding: { top: 14, bottom: 14 },
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        smoothScrolling: true,
        tabSize: 4,
        disableLayerHinting: true,
        readOnly: true,
      }}
      defaultLanguage="python"
      value={content}
      loading={<CenteredLoader />}
      onMount={handleMount}
    />
  )
}

export default ContextFileEditor
