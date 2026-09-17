import { useEffect, useState } from "react";
import {
  getPrecomputedStats,
  loadPrecomputedStats,
  type PrecomputedStats,
} from "@/utils/stats/precomputed";

/**
 * The precomputed file, fetched WITHOUT suspending.
 *
 * `usePrecomputedStats` throws the promise so a page waits for it, which is
 * right for a page built out of those stats and wrong for a note: a matchup
 * must not hold its own render on a garnish. So this kicks the same (deduped,
 * cached) fetch off and re-renders when it lands.
 *
 * Reading the cache alone was the first version, and it meant the notes never
 * appeared anywhere that had not already loaded the file for another reason —
 * absent rather than late, and silent either way. That is the same shape of bug
 * the crowns hit on the Hall of Fame page.
 *
 * In its own file because a page needs it too: `h2hDetail` passes
 * `narrate()`'s sentence into its share card, and exporting a hook from
 * `NarrativeNotes.tsx` alongside the component breaks fast refresh for it.
 */
export const useNarrativeStats = (): PrecomputedStats | null => {
  const [stats, setStats] = useState(getPrecomputedStats);

  useEffect(() => {
    if (stats) return;
    let live = true;
    loadPrecomputedStats()
      .then((loaded) => {
        if (live) setStats(loaded);
      })
      .catch((error) => {
        // A missing file means no notes, not a broken page — but say so, or a
        // bad deploy looks like a league with nothing notable in it.
        console.warn("Narrative notes unavailable:", error);
      });
    return () => {
      live = false;
    };
  }, [stats]);

  return stats;
};
