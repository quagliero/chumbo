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
          // NO manual chunk for charts or share cards, deliberately — see
          // scripts/check-bundle-size.js.
          //
          // D0 created a `charts` manual chunk so the workstream had a budget
          // line of its own. It backfired: a manual chunk is a candidate home
          // for anything shared, so Rollup put `domain/managerColors.ts` inside
          // it, and every component that uses a manager's accent —
          // ManagerIdentity, Links, ManagerCard, the Hall of Fame — then
          // statically depended on the chart chunk. All 24 kB of charts landed
          // in index.html's modulepreload and downloaded on every page. Naming
          // a `domain` chunk to pull it out only made Rollup duplicate the
          // module into both.
          //
          // The charts are already lazy at their real boundary (React.lazy in
          // the pages), so Rollup's own splitting keeps them off the critical
          // path without help. The budget now measures what index.html
          // actually preloads, which is the thing that was going wrong.
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
