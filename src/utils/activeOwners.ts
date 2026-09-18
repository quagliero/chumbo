import { seasons } from "@/data";
import { CURRENT_YEAR } from "@/domain/constants";

let cached: Set<string> | null = null;

/**
 * The owners on the current season's rosters — the "active teams only"
 * filter on the all-time tables.
 *
 * This used to be a module-level constant in each of the three tables that
 * have the filter, which was only possible while every season's rosters were
 * in the bundle: evaluated at import time, it now reads a season that has not
 * loaded (A2b) and would take the page down with it. Called from render, a
 * read before the current season's core is in suspends like any other.
 *
 * Cached once computed, because the rosters it reads never change after they
 * have loaded — and not before, because a throw is not a result.
 */
export const getActiveOwnerIds = (): Set<string> => {
  cached ??= new Set(
    seasons[CURRENT_YEAR].rosters.map((roster) => roster.owner_id.toString())
  );
  return cached;
};
