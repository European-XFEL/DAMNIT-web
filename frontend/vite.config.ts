import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import fs from "fs"
import https from "https"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  const {
    VITE_API,
    VITE_BASE_URL,
    VITE_MTLS_CA,
    VITE_MTLS_CERT,
    VITE_MTLS_KEY,
    VITE_PORT,
  } = env

  if (!VITE_API) {
    throw new Error("Missing required environment variables: VITE_API")
  }

  const basePath = (VITE_BASE_URL || "/").replace(/\/?$/, "/")
  const apiURL = new URL(VITE_API)

  let sslConfig
  if (VITE_MTLS_KEY && VITE_MTLS_CERT && VITE_MTLS_CA) {
    sslConfig = {
      key: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_KEY)),
      cert: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_CERT)),
      ca: fs.readFileSync(path.resolve(__dirname, VITE_MTLS_CA)),
      secureProtocol: "TLSv1_2_method",
      ciphers: [
        "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
        "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
      ].join(":"),
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
    base: basePath,
    plugins: [react()],
    build: {
      outDir: "build",
    },
    server: {
      host: true,
      port: Number(VITE_PORT) || 5173,
      proxy: {
        "/graphql": { ...defaultProxyConfig, ws: true },
        "/oauth": { ...defaultProxyConfig },
        "/metadata": { ...defaultProxyConfig },
      },
      https: sslConfig,
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
