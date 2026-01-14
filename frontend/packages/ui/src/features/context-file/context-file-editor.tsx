import { Editor as Monaco } from '@monaco-editor/react'

interface ContextFileEditorProps {
  content?: string
}

const ContextFileEditor = ({ content }: ContextFileEditorProps) => {
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
    />
  )
}

export default ContextFileEditor
