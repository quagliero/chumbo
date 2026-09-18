import { seasons, managers } from "@/data";
import { ValidYear } from "@/domain/constants";
import { collectH2HGames } from "./h2hGames";
import { summariseH2H } from "./h2hSummary";

/**
 * Which playoff round a week was. The bracket shape changed when the league
 * went from four playoff teams to six, so this has to be read off that
 * season's settings rather than counted back from the end.
 */
export const playoffRoundLabel = (year: number, week: number): string => {
  const settings = seasons[year as ValidYear]?.league?.settings;
  const playoffStartWeek = settings?.playoff_week_start || 15;
  const playoffTeams = settings?.playoff_teams || 6;

  if (playoffTeams === 4) {
    if (week === playoffStartWeek + 1) return "Championship";
    if (week === playoffStartWeek) return "Semi Finals";
    return `Round ${week}`;
  }

  if (week === playoffStartWeek + 2) return "Championship";
  if (week === playoffStartWeek + 1) return "Semi Finals";
  if (week === playoffStartWeek) return "Wildcard";
  return `Round ${week}`;
};

/**
 * Everything the head-to-head page shows for two managers, by manager id, or
 * `null` if either id is unknown. This was the page's one `useMemo`; the page
 * now memoises a call to it on the same two ids.
 */
export const getH2HData = (managerA: string, managerB: string) => {
  const managerAData = managers.find((m) => m.id === managerA);
  const managerBData = managers.find((m) => m.id === managerB);

  if (!managerAData || !managerBData) return null;

  const {
    regularSeasonMatchups,
    playoffMatchups,
    managerAPlayerScores,
    managerBPlayerScores,
  } = collectH2HGames(managerAData, managerBData);

  const {
    managerAWins,
    managerBWins,
    ties,
    managerATotalPoints,
    managerBTotalPoints,
    managerAAvgPoints,
    managerBAvgPoints,
    currentStreak,
    sortedMatchups,
    managerALineup,
    managerBLineup,
    managerABestPerformances,
    managerBBestPerformances,
  } = summariseH2H(
    regularSeasonMatchups,
    managerAPlayerScores,
    managerBPlayerScores
  );

  return {
    managerA: managerAData,
    managerB: managerBData,
    regularSeasonMatchups: sortedMatchups,
    playoffMatchups,
    managerALineup,
    managerBLineup,
    managerABestPerformances,
    managerBBestPerformances,
    stats: {
      managerAWins,
      managerBWins,
      ties,
      managerATotalPoints,
      managerBTotalPoints,
      managerAAvgPoints,
      managerBAvgPoints,
      currentStreak,
    },
  };
};

export type H2HData = NonNullable<ReturnType<typeof getH2HData>>;
export type H2HLineupSlot = H2HData["managerALineup"][number];
export type H2HBestPerformance = H2HData["managerABestPerformances"][number];
