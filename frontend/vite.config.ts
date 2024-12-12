import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import fs from "fs"
import https from "https"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  const { VITE_MTLS_KEY, VITE_MTLS_CERT, VITE_MTLS_CA, VITE_URL, VITE_API } =
    env

  if (!VITE_URL || !VITE_API) {
    throw new Error(
      "Missing required environment variables: VITE_URL and/or VITE_API",
    )
  }

  const baseURL = new URL(VITE_URL)
  const apiURL = new URL(VITE_API)

  let sslConfig
  if (VITE_MTLS_KEY && VITE_MTLS_CERT && VITE_MTLS_CA) {
    sslConfig = {
      key: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_KEY)),
      cert: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_CERT)),
      ca: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_CA)),
    }
  } else if (VITE_MTLS_KEY || VITE_MTLS_CERT || VITE_MTLS_CA) {
    // If partial mTLS variables are set, that's invalid.
    throw new Error(
      "mTLS configuration is incomplete. Please provide all three: key, cert, and ca.",
    )
  }

  const httpsAgent = sslConfig ? new https.Agent(sslConfig) : undefined

  // If the API server is HTTPS, mTLS configuration is required
  if (apiURL.protocol === "https:" && !sslConfig) {
    throw new Error("HTTPS API requires mTLS configuration")
  }

  const defaultProxyConfig = {
    target: apiURL.origin,
    secure: !!sslConfig,
    changeOrigin: false,
    configure: (proxy, options) => {
      if (sslConfig) {
        options.agent = httpsAgent
      }
    },
  }

  return {
    base: baseURL.href,
    plugins: [react()],
    build: {
      outDir: "build",
    },
    server: {
      host: true,
      port: baseURL.port ? Number(baseURL.port) : 5173,
      proxy: {
        "/graphql": { ...defaultProxyConfig, ws: true },
        "/oauth": { ...defaultProxyConfig },
        "/metadata": { ...defaultProxyConfig },
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
