import { defineConfig, loadEnv } from "vite"
import path from "path"
import react from "@vitejs/plugin-react"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const baseUrl = (env.VITE_BASE_URL || "/").replace(/\/?$/, "/")

  const createProxyConfig = (endpoint) => ({
    target: `https://${env.VITE_BACKEND_API}`,
    changeOrigin: false,
    rewrite: (path) => path.replace(new RegExp(`^${baseUrl}`), "/"),
  })

  return {
    base: baseUrl,
    plugins: [react()],
    build: {
      outDir: "build",
    },
    // REMOVEME: Use proxy to handle CORS for the meantime
    server: {
      host: true,
      port: Number(env.VITE_PORT) || 5173,
      proxy: {
        [`${baseUrl}graphql`]: createProxyConfig('graphql'),
        [`${baseUrl}oauth`]: createProxyConfig('oauth'),
        [`${baseUrl}metadata`]: createProxyConfig('metadata'),
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
