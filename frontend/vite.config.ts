import { defineConfig, loadEnv } from "vite"
import path from "path"
import react from "@vitejs/plugin-react"
import fs from "fs"
import https from "https"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const {
    VITE_BACKEND_API,
    VITE_BASE_URL,
    VITE_MTLS_CA,
    VITE_MTLS_CLIENT,
    VITE_MTLS_KEY,
    VITE_PORT,
  } = env

  let sslConfig = null
  if (VITE_MTLS_KEY && VITE_MTLS_CLIENT && VITE_MTLS_CA) {
    const keyPath = path.resolve(__dirname, VITE_MTLS_KEY)
    const certPath = path.resolve(__dirname, VITE_MTLS_CLIENT)
    const caPath = path.resolve(__dirname, VITE_MTLS_CA)

    if (
      fs.existsSync(keyPath) &&
      fs.existsSync(certPath) &&
      fs.existsSync(caPath)
    ) {
      sslConfig = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
        ca: fs.readFileSync(caPath),
      }
    }
  }

  const baseUrl = (VITE_BASE_URL || "/").replace(/\/?$/, "/")

  function createProxyConfig(overrides) {
    const defaults = {
      target: `https://${VITE_BACKEND_API}`,
      changeOrigin: false,
      rewrite: (path) => path.replace(new RegExp(`^${baseUrl}`), "/"),
      secure: sslConfig ? true : false,
      configure: (proxy, _options) => {
        if (sslConfig) {
          const httpsAgent = new https.Agent(sslConfig)
          _options.agent = httpsAgent
        }
      },
    }

    return { ...defaults, ...overrides }
  }

  return {
    base: baseUrl,
    plugins: [react()],
    build: {
      outDir: "build",
    },
    // REMOVEME: Use proxy to handle CORS for the meantime
    server: {
      host: true,
      port: Number(VITE_PORT) || 5173,
      proxy: {
        [`${baseUrl}graphql`]: createProxyConfig({ ws: true }),
        [`${baseUrl}oauth`]: createProxyConfig({}),
        [`${baseUrl}metadata`]: createProxyConfig({}),
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./tests/setup.ts"],
      testMatch: ["./tests/**/*.test.tsx"],
      threads: false,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
