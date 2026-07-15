import { useLayoutEffect, useRef } from 'react'
import { Editor as Monaco, type OnMount } from '@monaco-editor/react'

import CenteredLoader from '#src/components/feedback/centered-loader'
import { useAppDispatch, useAppStore } from '#src/app/store/hooks'
import { setView } from './context-file.slice'

type MonacoEditor = Parameters<OnMount>[0]

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
    // Focus on open (the tab remounts the editor each time) so Ctrl+F opens
    // Monaco's find widget instead of the browser's, without a click first.
    editor.focus()
  }

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
