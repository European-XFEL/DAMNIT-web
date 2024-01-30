/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REACT_APP_BACKEND_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
