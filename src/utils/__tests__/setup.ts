import { loadAllSeasons } from "@/data";
import { loadTimelines } from "@/utils/stats/loadTimelines";

/**
 * A2a moved matchups and transactions behind dynamic imports, so
 * `seasons[year].matchups` is empty until something awaits them.
 *
 * Vitest runs `setupFiles` to completion before it imports the test file, so
 * awaiting here means every suite — and every helper they import at module
 * scope — sees exactly the fully-populated `seasons` object it saw before the
 * split. That is the point: a loading-strategy change must not require a single
 * assertion to become async, or the snapshots stop being a safety net.
 */
await loadAllSeasons();

/**
 * And the weeks' timelines (L2), which are not season data: the registry's
 * timeline records refuse to answer without them, and `precomputed.test.ts`
 * recomputes every stat to check the committed answers.
 */
await loadTimelines();
