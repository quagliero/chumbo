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
    // `scripts/` is in here for G6: the route enumeration and the OG tag
    // generation are pure functions, and they are the parts of a build step
    // whose failures are invisible (a crawler never reports a bad tag).
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // A2a: matchups and transactions are dynamic imports now. This runs before
    // each test file is imported and awaits them, so every suite keeps reading
    // `seasons` synchronously exactly as it did.
    setupFiles: ["src/utils/__tests__/setup.ts"],
    // `managerStats.ts` logs on every H2H calculation; only surface console
    // output for tests that actually failed.
    silent: "passed-only",
    // The setup file above pulls in every season's matchups and transactions
    // before each test file runs, so the first import is slow. Headroom.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
