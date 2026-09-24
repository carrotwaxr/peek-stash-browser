import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    // Bundle analyzer - generates stats.html in dist folder
    visualizer({
      filename: "dist/stats.html",
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    // Never inline fonts into the render-blocking CSS: as separate files the
    // browser fetches each unicode-range subset only when a page uses it
    assetsInlineLimit: (filePath) =>
      /\.(woff2?|ttf|otf)$/.test(filePath) ? false : undefined,
    // Optimize production build
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
      },
    },
    // Chunk splitting configuration
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "video-vendor": ["video.js"],
          "ui-vendor": ["lucide-react", "react-hot-toast"],
        },
      },
    },
    // Increase chunk size warning limit (we'll fix with code splitting)
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      // Polling is only needed for Docker on Windows (WSL2 doesn't propagate fs events).
      // On Linux, native inotify works fine - no polling needed.
      // Set CHOKIDAR_USEPOLLING=true in environment for Windows dev (see docker-compose.windows.yml)
      usePolling: globalThis.process?.env?.CHOKIDAR_USEPOLLING === "true",
      interval: 1000,
      // Only watch src files, ignore everything else
      ignored: [
        "**/node_modules/**",
        "**/dist/**",
        "**/coverage/**",
        "**/.git/**",
        "**/stats.html",
      ],
    },
    proxy: {
      "/api": {
        target:
          globalThis.process?.env?.VITE_API_PROXY_TARGET ||
          "http://peek-server:8000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tests": path.resolve(__dirname, "./tests"),
      "@peek/shared-types": path.resolve(__dirname, "../shared/types"),
    },
  },
  preview: {
    port: 4173,
    host: true,
  },
});
