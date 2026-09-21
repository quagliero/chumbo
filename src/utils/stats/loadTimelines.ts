import { getWeek, loadAllWeeks } from "@/data/gamedays";
import { provideTimelines } from "./traverse";

/**
 * Load every committed week's timeline and hand it to the registry, so the
 * L2 records (`./gamedayStats`) can be computed.
 *
 * Deliberately its own module, and deliberately not exported from
 * `./index.ts`: it is the one file that imports the weeks, and importing the
 * weeks means a lookup table for all 229 of them. Only Node calls it — the
 * build-time precompute and the test setup. In the browser the records arrive
 * already answered, in `public/data/all-time.json`.
 */
export const loadTimelines = async (): Promise<void> => {
  await loadAllWeeks();
  provideTimelines((year, week) => getWeek(year, week) ?? null);
};
