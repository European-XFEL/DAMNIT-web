import { defineConfig, loadEnv } from "vite"
import path from "path"
import react from "@vitejs/plugin-react"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  return {
    plugins: [react()],
    build: {
      outDir: "build",
    },
    // REMOVEME: Use proxy to handle CORS for the meantime
    server: {
      host: true,
      port: Number(env.VITE_PORT) || 5173,
      proxy: {
        "/db": {
          target: `http://${env.VITE_BACKEND_API}`,
          changeOrigin: true,
          secure: false,
        },
        "/graphql": {
          target: `http://${env.VITE_BACKEND_API}`,
          changeOrigin: true,
          secure: false,
        },
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
