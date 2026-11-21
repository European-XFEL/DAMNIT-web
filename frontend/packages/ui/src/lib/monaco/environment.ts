import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = {
  globalAPI: true,
  getWorker: () => new EditorWorker(),
}
