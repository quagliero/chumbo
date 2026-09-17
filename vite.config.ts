import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
      "@/utils": "/src/utils",
      "@/types": "/src/types",
      "@/data": "/src/data",
      "@/presentation": "/src/presentation",
      "@/domain": "/src/domain",
      "@/hooks": "/src/hooks",
      "@/constants": "/src/constants",
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separate vendor chunks
          if (id.includes("node_modules")) {
            if (id.includes("@tanstack")) {
              return "vendor-table";
            }
            return "vendor";
          }
          // Separate players.json into its own chunk
          if (id.includes("/data/players.json")) {
            return "players";
          }
          // D0: every chart in workstream D lives under components/Chart, and
          // they share one chunk so the workstream's 40 kB budget is a number
          // the build can actually check rather than an intention. The cost is
          // that opening one chart page loads the others' marks too; at this
          // size that is cheaper than the bookkeeping to avoid it, and they
          // share the frame and scales regardless.
          if (id.includes("/presentation/components/Chart/")) {
            return "charts";
          }
          // A2a: the per-week files are loaded on demand, one chunk per season
          // per kind, so a page that wants 2014 fetches 2014 and nothing else.
          // Without this Rollup would emit ~500 chunks, one per week file.
          const perWeek = id.match(
            /\/data\/(\d{4})\/(matchups|transactions)[/.]/
          );
          if (perWeek) {
            return `${perWeek[2]}-${perWeek[1]}`;
          }
          // Keep the small per-season files in the main chunk
          if (id.includes("/data/") && id.includes(".json")) {
            return "data";
          }
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
  },
});
