import { defineConfig, loadEnv, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }): UserConfig => {
  // Resolve base URL

  const { VITE_BASE_URL } = loadEnv(mode, process.cwd())
  const BASE_URL = (VITE_BASE_URL || '/').replace(/\/?$/, '/')

  return {
    base: BASE_URL,
    plugins: [react()],
    resolve: {
      alias: {
        // /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
        '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
      },
    },
  }
})
