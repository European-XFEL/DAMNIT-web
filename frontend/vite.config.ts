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

  let sslConfig = null
  if (VITE_MTLS_KEY && VITE_MTLS_CERT && VITE_MTLS_CA) {
    sslConfig = {
      key: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_KEY)),
      cert: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_CERT)),
      ca: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_CA)),
    }
  } else if (VITE_MTLS_KEY || VITE_MTLS_CERT || VITE_MTLS_CA) {
    throw new Error("mTLS configuration requires all of key, cert, and ca")
  }

  const httpsAgent = sslConfig ? new https.Agent(sslConfig) : undefined

  // If the API server is HTTPS, mTLS configuration is required
  if (VITE_BACKEND_API.startsWith("https:") && !sslConfig) {
    throw new Error("HTTPS API requires mTLS configuration")
  }

  const defaultProxyConfig = {
    target: VITE_BACKEND_API,
    secure: !!sslConfig,
    changeOrigin: false,
    configure: (proxy: any, options: { agent?: https.Agent }) => {
      if (sslConfig) {
        options.agent = httpsAgent
      }
    },
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
        [`${baseUrl}graphql`]: { ...defaultProxyConfig, ws: true },
        [`${baseUrl}oauth`]: { ...defaultProxyConfig },
        [`${baseUrl}metadata`]: { ...defaultProxyConfig },
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
