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
    VITE_MTLS_CERT,
    VITE_MTLS_KEY,
    VITE_PORT,
  } = env

  const baseUrl = (VITE_BASE_URL || "/").replace(/\/?$/, "/")

  const mtlsAll = Boolean(VITE_MTLS_KEY && VITE_MTLS_CERT && VITE_MTLS_CA)
  const mtlsAny = Boolean(VITE_MTLS_KEY || VITE_MTLS_CERT || VITE_MTLS_CA)

  if (mtlsAny && !mtlsAll) {
    throw new Error("mTLS configuration requires all of key, cert, and ca")
  }

  const mtlsEnabled = mtlsAll

  const sslConfig = mtlsEnabled
    ? {
        key: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_KEY)),
        cert: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_CERT)),
        ca: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_CA)),
      }
    : null

  const httpsAgent = sslConfig ? new https.Agent(sslConfig) : null

  // If the API server is HTTPS, mTLS configuration is required
  if (VITE_BACKEND_API.startsWith("https:") && !sslConfig) {
    throw new Error("HTTPS API requires mTLS configuration")
  }

  function createProxyConfig(overrides) {
    const defaults = {
      target: `https://${VITE_BACKEND_API}`,
      changeOrigin: false,
      rewrite: (path) => path.replace(new RegExp(`^${baseUrl}`), "/"),
      secure: sslConfig ? true : false,
      configure: (proxy, _options) => {
        if (sslConfig) {
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
