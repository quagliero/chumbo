import { useMemo } from "react";
import { YEAR_NUMBERS } from "@/domain/constants";
import { useDataLoaded } from "@/hooks/useSeasonData";
import {
  buildMatchupPreview,
  fixturesFor,
  stakesFor,
  type MatchupPreview,
} from "@/utils/matchupPreview";

/**
 * Every preview for a week (K1), with the stakes simulated once for all of
 * them rather than once per card.
 *
 * A rivalry is fifteen seasons long, so this loads every season's core and
 * matchups — the one view on the matchups tab that reads the archive — and
 * the players, because the milestones come from the manager stats, which
 * name players.
 */
export const useWeekPreviews = (year: number, week: number): MatchupPreview[] => {
  useDataLoaded(
    { years: YEAR_NUMBERS, parts: ["core", "matchups"] },
    { years: [year], players: true }
  );
  return useMemo(() => {
    const stakes = stakesFor(year, week);
    return fixturesFor(year, week)
      .map(([id]) => buildMatchupPreview(year, week, id, stakes))
      .filter((preview): preview is MatchupPreview => preview !== null);
  }, [year, week]);
};
