import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

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
      // Polling is needed for Docker on Windows, but we can optimize it
      usePolling: true,
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
        target: "http://peek-server:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
  },
});
