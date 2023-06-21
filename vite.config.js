import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  return {
    build: {
      outDir: "build",
    },
    // REMOVEME: Use proxy to handle CORS for the meantime
    server: {
      proxy: {
        "/db": {
          target: "http://localhost:30200",
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [react()],
  };
});
