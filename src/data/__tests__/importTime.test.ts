import { describe, expect, it, vi } from "vitest";

/**
 * No module reads season data when it is imported (A2b).
 *
 * Until A2b every season's rosters were in the bundle, so a module could
 * compute something from them at the top level — the active owners, the
 * completed seasons — and four did. Now nothing is loaded at import time,
 * and a top-level read throws `DataNotLoadedError` while the module is being
 * evaluated: the lazy route that imports it fails to load, and the page with
 * it. Three of those four were found by grep and one by `yarn build`; this is
 * the check that does not depend on either.
 *
 * It imports every module under src/ — and the prerender's route table —
 * against a loader that has loaded nothing.
 */

const modules = import.meta.glob([
  "/src/**/*.{ts,tsx}",
  "/scripts/og/*.ts",
  // Entry point: renders into `document`, which Node does not have.
  "!/src/main.tsx",
  "!/src/**/__tests__/**",
  "!/src/**/__harness__/**",
  "!**/*.test.ts",
  "!**/*.d.ts",
]);

describe("importing a module", () => {
  it("never reads season data", async () => {
    vi.resetModules();
    const { DataNotLoadedError, areSeasonPartsLoaded, arePlayersLoaded } =
      await import("@/data");

    const readers: string[] = [];
    for (const [path, load] of Object.entries(modules)) {
      try {
        await load();
      } catch (error) {
        if (error instanceof DataNotLoadedError) {
          readers.push(`${path}: ${error.message.split(" was read")[0]}`);
        } else {
          throw error;
        }
      }
    }

    expect(readers).toEqual([]);
    // And none of them started a load, which a caught read would have.
    expect(areSeasonPartsLoaded([2014], ["core"])).toBe(false);
    expect(arePlayersLoaded()).toBe(false);
  });
});
