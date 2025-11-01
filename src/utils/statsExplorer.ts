import { seasons } from "@/data";
import { ExtendedMatchup } from "@/types/matchup";
import { YEARS } from "@/domain/constants";
import { getPlayerPosition } from "@/utils/playerDataUtils";
import { isRegularSeasonWeek, getPlayoffWeekStart } from "@/utils/playoffUtils";
import { determineMatchupResult } from "@/utils/recordUtils";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { isWeekCompleted } from "@/utils/weekUtils";

export interface PositionalFilter {
  position:
    | "QB"
    | "RB"
    | "WR"
    | "TE"
    | "K"
    | "DEF"
    | "FLEX"
    | "RB_INDIVIDUAL"
    | "WR_INDIVIDUAL";
  operator: ">=" | ">" | "<=" | "<" | "=" | "between";
  points: number;
  maxPoints?: number; // For "between" operator, the upper bound
  minimumCount?: number; // For individual positions, minimum number of players that must meet criteria
  managerId?: string; // Optional manager ID to filter by specific manager
}

export interface StatsResult {
  totalMatchups: number;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  // Breakdown by position scores
  positionalBreakdown: Record<
    string,
    { avg: number; min: number; max: number }
  >;
  // Sample matchups that matched the criteria
  sampleMatchups: Array<{
    year: number;
    week: number;
    rosterId: number;
    matchupId: number;
    points: number;
    result: "W" | "L" | "T";
    opponentPoints: number;
    positionalScores: Record<string, number>;
  }>;
}

export interface MatchupPositionalData {
  year: number;
  week: number;
  rosterId: number;
  points: number;
  opponentPoints: number;
  result: "W" | "L" | "T";
  positionalScores: Record<string, number>;
}

/**
 * Extract positional scores from a matchup
 */
const extractPositionalScores = (
  matchup: ExtendedMatchup,
  year: number
): Record<string, number | number[]> => {
  const positionalScores: Record<string, number | number[]> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DEF: 0,
    FLEX: 0,
    RB_INDIVIDUAL: 0,
    WR_INDIVIDUAL: 0,
    RB_INDIVIDUAL_ARRAY: [], // Array of all individual RB scores
    WR_INDIVIDUAL_ARRAY: [], // Array of all individual WR scores
  };

  const starters = matchup.starters || [];
  const startersPoints = matchup.starters_points || [];

  // Track individual RB and WR scores (highest single player and all scores)
  let maxRBScore = 0;
  let maxWRScore = 0;
  const allRBScores: number[] = [];
  const allWRScores: number[] = [];

  // Map starter positions (typical lineup: QB, RB, RB, WR, WR, TE, FLEX, K, DEF)
  const positionMap = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];

  starters.forEach((playerId, index) => {
    if (playerId === "0" || index >= startersPoints.length) return;

    const points = startersPoints[index] || 0;
    const expectedPosition = positionMap[index];

    // For FLEX position, determine actual position
    if (expectedPosition === "FLEX") {
      const actualPosition = getPlayerPosition(playerId, year);
      if (
        actualPosition === "RB" ||
        actualPosition === "WR" ||
        actualPosition === "TE"
      ) {
        positionalScores[actualPosition] =
          (positionalScores[actualPosition] as number) + points;

        // Track individual performance
        if (actualPosition === "RB") {
          maxRBScore = Math.max(maxRBScore, points);
          allRBScores.push(points);
        } else if (actualPosition === "WR") {
          maxWRScore = Math.max(maxWRScore, points);
          allWRScores.push(points);
        }
      }
      positionalScores.FLEX = (positionalScores.FLEX as number) + points; // Also count towards FLEX total
    } else {
      positionalScores[expectedPosition] =
        (positionalScores[expectedPosition] as number) + points;

      // Track individual performance
      if (expectedPosition === "RB") {
        maxRBScore = Math.max(maxRBScore, points);
        allRBScores.push(points);
      } else if (expectedPosition === "WR") {
        maxWRScore = Math.max(maxWRScore, points);
        allWRScores.push(points);
      }
    }
  });

  // Set individual performance scores
  positionalScores.RB_INDIVIDUAL = maxRBScore;
  positionalScores.WR_INDIVIDUAL = maxWRScore;
  positionalScores.RB_INDIVIDUAL_ARRAY = allRBScores;
  positionalScores.WR_INDIVIDUAL_ARRAY = allWRScores;

  return positionalScores;
};

/**
 * Check if individual scores meet a filter criteria
 */
const checkIndividualFilter = (
  individualScores: number[],
  filter: PositionalFilter
): boolean => {
  const minimumCount = filter.minimumCount || 1;
  let count = 0;

  for (const individualScore of individualScores) {
    switch (filter.operator) {
      case ">=":
        if (individualScore >= filter.points) count++;
        break;
      case ">":
        if (individualScore > filter.points) count++;
        break;
      case "<=":
        if (individualScore <= filter.points) count++;
        break;
      case "<":
        if (individualScore < filter.points) count++;
        break;
      case "=":
        if (individualScore === filter.points) count++;
        break;
      case "between": {
        const min = filter.points;
        const max = filter.maxPoints ?? filter.points;
        if (individualScore >= min && individualScore <= max) count++;
        break;
      }
    }
  }
  return count >= minimumCount;
};

/**
 * Check if a matchup meets all filter criteria
 */
const matchesFilters = (
  positionalScores: Record<string, number | number[]>,
  filters: PositionalFilter[]
): boolean => {
  return filters.every((filter) => {
    // Handle individual position filters - always check against individual player arrays
    // This allows multiple filters with different criteria (e.g., one RB >= 20 and one RB <= 5)
    if (filter.position === "RB_INDIVIDUAL") {
      const individualScores = (positionalScores.RB_INDIVIDUAL_ARRAY ||
        []) as number[];
      return checkIndividualFilter(individualScores, filter);
    }

    if (filter.position === "WR_INDIVIDUAL") {
      const individualScores = (positionalScores.WR_INDIVIDUAL_ARRAY ||
        []) as number[];
      return checkIndividualFilter(individualScores, filter);
    }

    // Default handling for regular position filters (totals, not individual)
    const score = positionalScores[filter.position];
    const numericScore = (typeof score === "number" ? score : 0) as number;

    switch (filter.operator) {
      case ">=":
        return numericScore >= filter.points;
      case ">":
        return numericScore > filter.points;
      case "<=":
        return numericScore <= filter.points;
      case "<":
        return numericScore < filter.points;
      case "=":
        return numericScore === filter.points;
      case "between": {
        const min = filter.points;
        const max = filter.maxPoints ?? filter.points;
        return numericScore >= min && numericScore <= max;
      }
      default:
        return false;
    }
  });
};

/**
 * Calculate statistics based on positional scoring filters
 */
export const calculatePositionalStats = (
  filters: PositionalFilter[],
  selectedYears: number[] = YEARS,
  includePlayoffs: boolean = false,
  selectedManagerId?: string
): StatsResult => {
  let totalMatchups = 0;
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let totalPointsFor = 0;
  let totalPointsAgainst = 0;

  const positionalTotals: Record<
    string,
    { sum: number; count: number; min: number; max: number }
  > = {};
  const allSampleMatchups: StatsResult["sampleMatchups"] = [];

  // Initialize positional totals
  [
    "QB",
    "RB",
    "WR",
    "TE",
    "K",
    "DEF",
    "FLEX",
    "RB_INDIVIDUAL",
    "WR_INDIVIDUAL",
  ].forEach((pos) => {
    positionalTotals[pos] = { sum: 0, count: 0, min: Infinity, max: -Infinity };
  });

  // Process each selected year
  selectedYears.forEach((year) => {
    const seasonData = seasons[year as keyof typeof seasons];
    if (!seasonData?.matchups) return;

    const playoffWeekStart = getPlayoffWeekStart(seasonData);

    // Process each week
    Object.entries(seasonData.matchups).forEach(([weekStr, weekMatchups]) => {
      const week = parseInt(weekStr);

      // Filter by regular season vs playoffs
      if (!includePlayoffs && !isRegularSeasonWeek(week, playoffWeekStart)) {
        return;
      }

      // Only process completed weeks
      if (!isWeekCompleted(week, seasonData.league)) {
        return;
      }

      // Process each matchup
      weekMatchups.forEach((matchup) => {
        // Filter by manager if specified
        if (selectedManagerId) {
          const roster = seasonData.rosters?.find(
            (r) => r.roster_id === matchup.roster_id
          );
          if (roster) {
            const matchupManagerId = getManagerIdBySleeperOwnerId(
              roster.owner_id
            );
            if (matchupManagerId !== selectedManagerId) {
              return; // Skip this matchup if it doesn't match the selected manager
            }
          }
        }

        const positionalScores = extractPositionalScores(matchup, year);

        // Check if this matchup meets all filter criteria
        if (matchesFilters(positionalScores, filters)) {
          totalMatchups++;
          totalPointsFor += matchup.points;

          // Find opponent matchup
          const opponentMatchup = weekMatchups.find(
            (m) =>
              m.matchup_id === matchup.matchup_id &&
              m.roster_id !== matchup.roster_id
          );

          if (opponentMatchup) {
            totalPointsAgainst += opponentMatchup.points;
            const result = determineMatchupResult(
              matchup.points,
              opponentMatchup.points
            );

            if (result === "W") wins++;
            else if (result === "L") losses++;
            else ties++;

            // Collect all sample matchups (we'll sort and limit later)
            // Filter out array properties for display
            const displayPositionalScores: Record<string, number> = {};
            Object.entries(positionalScores).forEach(([key, value]) => {
              if (typeof value === "number") {
                displayPositionalScores[key] = value;
              }
            });

            allSampleMatchups.push({
              year,
              week,
              rosterId: matchup.roster_id,
              matchupId: matchup.matchup_id,
              points: matchup.points,
              result,
              opponentPoints: opponentMatchup.points,
              positionalScores: displayPositionalScores,
            });
          }

          // Update positional totals (only for numeric scores, skip arrays)
          Object.entries(positionalScores).forEach(([position, score]) => {
            if (positionalTotals[position] && typeof score === "number") {
              positionalTotals[position].sum += score;
              positionalTotals[position].count++;
              positionalTotals[position].min = Math.min(
                positionalTotals[position].min,
                score
              );
              positionalTotals[position].max = Math.max(
                positionalTotals[position].max,
                score
              );
            }
          });
        }
      });
    });
  });

  // Calculate averages and create breakdown
  const positionalBreakdown: Record<
    string,
    { avg: number; min: number; max: number }
  > = {};
  Object.entries(positionalTotals).forEach(([position, data]) => {
    positionalBreakdown[position] = {
      avg: data.count > 0 ? data.sum / data.count : 0,
      min: data.min === Infinity ? 0 : data.min,
      max: data.max === -Infinity ? 0 : data.max,
    };
  });

  // Sort sample matchups by newest first (year descending, then week descending)
  const sortedSampleMatchups = allSampleMatchups.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.week - a.week;
  });

  // Limit to 200 most recent for display (to prevent UI performance issues)
  const sampleMatchups = sortedSampleMatchups.slice(0, 200);

  const winPercentage =
    totalMatchups > 0 ? (wins + ties * 0.5) / totalMatchups : 0;

  return {
    totalMatchups,
    wins,
    losses,
    ties,
    winPercentage,
    avgPointsFor: totalMatchups > 0 ? totalPointsFor / totalMatchups : 0,
    avgPointsAgainst:
      totalMatchups > 0 ? totalPointsAgainst / totalMatchups : 0,
    positionalBreakdown,
    sampleMatchups,
  };
};

/**
 * Get all available years for filtering
 */
export const getAvailableYears = (): number[] => {
  return YEARS;
};

/**
 * Preset filter configurations
 */
export const PRESET_FILTERS: Record<string, PositionalFilter[]> = {
  "QB 25+ Points": [{ position: "QB", operator: ">=", points: 25 }],
  "RB Total 30+ Points": [{ position: "RB", operator: ">=", points: 30 }],
  "Any RB 15+ Points": [
    { position: "RB_INDIVIDUAL", operator: ">=", points: 15 },
  ],
  "WR Total 25+ Points": [{ position: "WR", operator: ">=", points: 25 }],
  "Any WR 12+ Points": [
    { position: "WR_INDIVIDUAL", operator: ">=", points: 12 },
  ],
  "QB 25+ AND RB Total 30+": [
    { position: "QB", operator: ">=", points: 25 },
    { position: "RB", operator: ">=", points: 30 },
  ],
  "Any RB 15+ AND Any WR 12+": [
    { position: "RB_INDIVIDUAL", operator: ">=", points: 15 },
    { position: "WR_INDIVIDUAL", operator: ">=", points: 12 },
  ],
  "RB Total 30+ AND Any RB 20+": [
    { position: "RB", operator: ">=", points: 30 },
    { position: "RB_INDIVIDUAL", operator: ">=", points: 20 },
  ],
  "All Starters 10+": [
    { position: "QB", operator: ">=", points: 10 },
    { position: "RB", operator: ">=", points: 10 },
    { position: "WR", operator: ">=", points: 10 },
    { position: "TE", operator: ">=", points: 10 },
    { position: "K", operator: ">=", points: 10 },
    { position: "DEF", operator: ">=", points: 10 },
  ],
  "High Scoring QB (30+)": [{ position: "QB", operator: ">=", points: 30 }],
  "Elite RB Total (35+)": [{ position: "RB", operator: ">=", points: 35 }],
};
