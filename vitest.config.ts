import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Kept identical to the aliases in vite.config.ts / tsconfig.app.json.
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
  test: {
    // These are pure functions over committed JSON — no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // `managerStats.ts` logs on every H2H calculation; only surface console
    // output for tests that actually failed.
    silent: "passed-only",
    // src/data/index.ts eagerly loads ~19MB of JSON via import.meta.glob, so
    // the first import in each file is slow. Leave plenty of headroom.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
