import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { YEAR_NUMBERS } from "@/domain/constants";
import { buildCareerTimeline } from "@/presentation/components/ManagerDetail/useCareerTimeline";
import { getSeasonCrowns } from "@/utils/crowns";
import { getManagerStats } from "@/utils/managerStats";
import { isSeasonSettled } from "@/utils/playoffUtils";
import { managerStory } from "./managerStory";

/**
 * Every manager's line (F1e), from real data. Regular-season stats whatever
 * the page's data-mode select says: a story is about a career, and the
 * brackets that settle finishes are the same in every mode.
 *
 * Needs every season's matchups loaded; the Managers page already suspends
 * on `useAllSeasons` before it gets here.
 */
export const buildManagerStories = (): Record<string, string | null> => {
  const settledYears = YEAR_NUMBERS.filter((year) =>
    isSeasonSettled(seasons[year])
  );
  const latestSettledYear = Math.max(...settledYears);

  const scumbos = new Map<string, number[]>();
  for (const year of settledYears) {
    for (const crown of getSeasonCrowns(year)) {
      if (!crown.worstAllPlay) continue;
      scumbos.set(crown.managerId, [...(scumbos.get(crown.managerId) ?? []), year]);
    }
  }

  return Object.fromEntries(
    managers.map((manager) => {
      const stats = getManagerStats(manager.id, "regular");
      if (!stats) return [manager.id, null];
      return [
        manager.id,
        managerStory({
          timeline: buildCareerTimeline(manager.id, stats.seasonStats),
          scumboYears: scumbos.get(manager.id) ?? [],
          latestSettledYear,
        }),
      ];
    })
  );
};
