import { seasons } from "@/data";
import { ExtendedMatchup } from "@/types/matchup";
import { YEARS } from "@/domain/constants";
import { getPlayerPosition } from "@/utils/playerDataUtils";
import { isRegularSeasonWeek, getPlayoffWeekStart } from "@/utils/playoffUtils";
import { determineMatchupResult } from "@/utils/recordUtils";

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
  operator: ">=" | ">" | "<=" | "<" | "=";
  points: number;
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
): Record<string, number> => {
  const positionalScores: Record<string, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DEF: 0,
    FLEX: 0,
    RB_INDIVIDUAL: 0,
    WR_INDIVIDUAL: 0,
  };

  const starters = matchup.starters || [];
  const startersPoints = matchup.starters_points || [];

  // Track individual RB and WR scores (highest single player)
  let maxRBScore = 0;
  let maxWRScore = 0;

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
        positionalScores[actualPosition] += points;

        // Track individual performance
        if (actualPosition === "RB") {
          maxRBScore = Math.max(maxRBScore, points);
        } else if (actualPosition === "WR") {
          maxWRScore = Math.max(maxWRScore, points);
        }
      }
      positionalScores.FLEX += points; // Also count towards FLEX total
    } else {
      positionalScores[expectedPosition] += points;

      // Track individual performance
      if (expectedPosition === "RB") {
        maxRBScore = Math.max(maxRBScore, points);
      } else if (expectedPosition === "WR") {
        maxWRScore = Math.max(maxWRScore, points);
      }
    }
  });

  // Set individual performance scores
  positionalScores.RB_INDIVIDUAL = maxRBScore;
  positionalScores.WR_INDIVIDUAL = maxWRScore;

  return positionalScores;
};

/**
 * Check if a matchup meets all filter criteria
 */
const matchesFilters = (
  positionalScores: Record<string, number>,
  filters: PositionalFilter[]
): boolean => {
  return filters.every((filter) => {
    const score = positionalScores[filter.position] || 0;

    switch (filter.operator) {
      case ">=":
        return score >= filter.points;
      case ">":
        return score > filter.points;
      case "<=":
        return score <= filter.points;
      case "<":
        return score < filter.points;
      case "=":
        return score === filter.points;
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
  includePlayoffs: boolean = false
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
  const sampleMatchups: StatsResult["sampleMatchups"] = [];

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

      // Process each matchup
      weekMatchups.forEach((matchup) => {
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

            // Add to sample matchups (limit to 50 for performance)
            if (sampleMatchups.length < 50) {
              sampleMatchups.push({
                year,
                week,
                rosterId: matchup.roster_id,
                points: matchup.points,
                result,
                opponentPoints: opponentMatchup.points,
                positionalScores: { ...positionalScores },
              });
            }
          }

          // Update positional totals
          Object.entries(positionalScores).forEach(([position, score]) => {
            if (positionalTotals[position]) {
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
