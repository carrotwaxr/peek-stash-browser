import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    // Bundle analyzer, only for `npm run build:analyze` (--mode analyze):
    // writes dist/stats.html
    mode === "analyze" &&
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
      // A barrel (src/**/index.ts) only re-exports (tests/scripts/barrels.test.ts
      // holds it to that), so it has no side effects of its own: importing one
      // name from it no longer pulls every module it re-exports into the chunk
      treeshake: {
        moduleSideEffects: (id, external) =>
          external || !/\/client\/src\/.*\/index\.ts$/.test(id),
      },
      output: {
        // A dynamic chunk is named after its entry module: the VR code
        // (vr/vrPlugin.ts with the fork and three.js) is the `vr` chunk, the
        // name its line in scripts/bundleBudget.mjs uses
        chunkFileNames: (chunk) =>
          chunk.facadeModuleId?.endsWith("/video-player/vr/vrPlugin.ts")
            ? "assets/vr-[hash].js"
            : "assets/[name]-[hash].js",
        manualChunks: {
          // Separate vendor chunks for better caching
          "react-vendor": [
            "react",
            "react-dom",
            "react-dom/client",
            "react-router-dom",
          ],
          "query-vendor": ["@tanstack/react-query"],
          "video-vendor": ["video.js"],
          // lucide-react stays out: each chunk that imports an icon carries it,
          // so the first load holds only the icons the shell draws
          "ui-vendor": ["react-hot-toast"],
        },
      },
    },
    // video-vendor is video.js with VHS (about 620 kB, no smaller build plays
    // HLS and DASH); any other chunk this large still warns, the lazy `vr`
    // chunk (about 750 kB) on purpose. The gate is scripts/bundleBudget.mjs
    // (npm run check:bundle), which fails the build.
    chunkSizeWarningLimit: 650,
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
  // The VR fork is first met through loadVr's import(): pre-bundle it at
  // start, or Vite dev re-optimises and reloads the page at the VR click
  optimizeDeps: {
    include: ["@blaineam/videojs-vr"],
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
}));
