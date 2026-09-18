import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import { SEASON_FILE_PARTS } from "./src/data/parts";

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
  json: {
    // One `JSON.parse` of the whole file rather than a JS object literal per
    // top-level key. With named exports on, Vite only stringifies values over
    // 10 kB, and no single player is — so the 665 kB dictionary shipped as
    // 4,389 object literals for the JS parser to chew through. Nothing
    // imports a JSON file by name; everything takes the default export.
    //
    // Measured on the dictionary (A2b): evaluating it drops from 6.7 ms to
    // 3.9 ms (median, Node, an M-series laptop — several times that on a
    // phone), for 3.9 kB more gzip, because the escaped quotes in a string
    // literal compress slightly worse than bare object syntax.
    namedExports: false,
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
          // A2: every season file is loaded on demand, and these group them
          // into the units `src/data/index.ts` loads — one chunk per season
          // per part, so a page that wants 2014 fetches 2014 and nothing else.
          // Without them Rollup would emit ~460 chunks, one per file.
          //
          // These are data, not features: the rule against a manual chunk per
          // feature (above) is about shared CODE finding a home in a chunk it
          // does not belong to. A JSON module has no imports and nothing to
          // share, so the hazard does not arise — and the names are what make
          // a network tab, and the budget's output, readable.
          //
          // The parts are defined once, in src/data/parts.ts, which the
          // loader reads too. `matchups/3.json` and the legacy whole-season
          // `transactions.json` both match on their folder or file name — as
          // does anything else in those folders, such as the week-18 file and
          // the `transactions/all.json` that `--all-transactions` writes,
          // which the loader skips but the glob still imports.
          // L1's box scores: one chunk per week, because a matchup page
          // wants one week and nothing else does. See src/data/gamedays.ts.
          const gameday = id.match(/\/src\/data\/(\d{4})\/gamedays\/(\d+)\.json$/);
          if (gameday) return `gameday-${gameday[1]}-${gameday[2]}`;
          const season = id.match(
            /\/src\/data\/(\d{4})\/([^/.]+)(?:\/[^/]+)?\.json$/
          );
          if (season && season[2] in SEASON_FILE_PARTS) {
            const part =
              SEASON_FILE_PARTS[season[2] as keyof typeof SEASON_FILE_PARTS];
            return `${part}-${season[1]}`;
          }
          // The player dictionary, with every season's overlay: `getPlayer`
          // reads them together, so they load together.
          if (/\/src\/data\/(players|\d{4}\/players\.delta)\.json$/.test(id)) {
            return "players";
          }
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
  },
});
