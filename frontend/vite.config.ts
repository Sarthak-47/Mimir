import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Tauri dev server host
  server: {
    port: 5173,
    strictPort: true,
  },
  // Tauri expects a fixed port
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri uses Chromium on Windows/macOS and WebKit on Linux
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    // Raise warning threshold — vendor chunks will be large but that's expected
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split stable vendor code into separately cached chunks.
        // react + react-dom: never changes between app releases → long-lived cache hit.
        // katex:             heavy math lib (~100 kB); only the chat view uses it.
        manualChunks(id: string) {
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/")
          ) {
            return "vendor-react";
          }
          if (id.includes("node_modules/katex")) {
            return "vendor-katex";
          }
        },
      },
    },
  },
});
