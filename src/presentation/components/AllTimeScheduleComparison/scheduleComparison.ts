import { seasons } from "@/data";
import { getTeamName } from "@/utils/teamName";
import {
  calculateWinPercentage,
  roundToTwoDecimals,
} from "@/utils/recordUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { ExtendedMatchup } from "@/types/matchup";

/**
 * The all-time schedule comparison, worked out from `seasons` with no React in
 * sight — the page's two tables are views of what is computed here, so this is
 * the part a test can pin without rendering anything.
 */

export interface CrossScheduleRecord {
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
}

/**
 * One row of the by-team table: a team whose schedule the selected team could
 * have played, and the record they would have had playing it.
 *
 * The record is resolved into the row rather than looked up at render time so
 * that sorting can just read the column, which is what the hand-rolled sort
 * this replaced had to reimplement for each of its five fields.
 */
export interface ComparisonRow {
  ownerId: string;
  teamName: string;
  /** The selected team's own row, which shows their actual record. */
  isSelectedTeam: boolean;
  record: CrossScheduleRecord;
  /** Win-percentage points better or worse than the selected team's actual. */
  recordDifference: number;
}

/** ".500", not "0.500" — the convention every fantasy site uses. */
export const formatWinPercentage = (winPercentage: number) => {
  const formatted = winPercentage.toFixed(3);
  return formatted.startsWith("0.") ? formatted.substring(1) : formatted;
};

/** A team with no games against a schedule has no comparison to show. */
export const isEmptyRecord = (record: CrossScheduleRecord) =>
  record.wins === 0 && record.losses === 0 && record.ties === 0;

export const differenceClass = (difference: number) =>
  difference > 0
    ? "text-green-600"
    : difference < 0
    ? "text-red-600"
    : "text-ink-muted";

export interface AllTimeScheduleComparisonStats {
  ownerId: string;
  teamName: string;
  actualRecord: {
    wins: number;
    losses: number;
    ties: number;
    winPercentage: number;
  };
  crossScheduleRecords: {
    [opponentOwnerId: string]: {
      wins: number;
      losses: number;
      ties: number;
      winPercentage: number;
    };
  };
}

/**
 * Every team's actual all-time record, and the record it would have had
 * playing each other team's schedule, best actual win percentage first.
 *
 * Calculated using the same logic as ScheduleComparison.
 *
 * @param activeTeamsOnly - only teams in the most recent season, both as rows
 * and as schedules to compare against.
 */
export const getAllTimeScheduleComparison = (
  activeTeamsOnly: boolean
): AllTimeScheduleComparisonStats[] => {
  const statsMap = new Map<string, AllTimeScheduleComparisonStats>();

  // Get all unique owner IDs across all seasons
  const allOwnerIds = new Set<string>();
  Object.values(seasons).forEach((seasonData) => {
    seasonData.rosters?.forEach((roster) => {
      allOwnerIds.add(roster.owner_id);
    });
  });

  // Get active teams (teams that played in the most recent season)
  const activeOwnerIds = new Set<string>();
  const mostRecentYear = Math.max(...Object.keys(seasons).map(Number));
  const mostRecentSeason = seasons[mostRecentYear as keyof typeof seasons];
  mostRecentSeason?.rosters?.forEach((roster) => {
    activeOwnerIds.add(roster.owner_id);
  });

  // Filter owner IDs based on active teams setting
  const filteredOwnerIds = activeTeamsOnly
    ? Array.from(allOwnerIds).filter((id) => activeOwnerIds.has(id))
    : Array.from(allOwnerIds);

  // Calculate stats for each owner
  filteredOwnerIds.forEach((ownerId) => {
    const teamName = getTeamName(ownerId);
    let totalWins = 0;
    let totalLosses = 0;
    let totalTies = 0;
    const crossScheduleRecords: {
      [key: string]: {
        wins: number;
        losses: number;
        ties: number;
        winPercentage: number;
      };
    } = {};

    // Initialize cross-schedule records for all other teams
    filteredOwnerIds.forEach((opponentId) => {
      if (opponentId !== ownerId) {
        crossScheduleRecords[opponentId] = {
          wins: 0,
          losses: 0,
          ties: 0,
          winPercentage: 0,
        };
      }
    });

    // Process each season
    Object.entries(seasons).forEach(([, seasonData]) => {
      const playoffWeekStart =
        seasonData.league?.settings?.playoff_week_start || 15;

      // Find this owner's roster for this season
      const ownerRoster = seasonData.rosters?.find(
        (r) => r.owner_id === ownerId
      );
      if (!ownerRoster) return; // Skip if owner wasn't in this season

      // Add actual record from roster settings (same as ScheduleComparison)
      totalWins += ownerRoster.settings.wins;
      totalLosses += ownerRoster.settings.losses;
      totalTies += ownerRoster.settings.ties;

      // Calculate cross-schedule records using the same logic as ScheduleComparison
      filteredOwnerIds.forEach((opponentId) => {
        if (opponentId === ownerId) return;

        // Find opponent's roster for this season
        const opponentRoster = seasonData.rosters?.find(
          (r) => r.owner_id === opponentId
        );

        // If opponent wasn't in this season, skip
        if (!opponentRoster) return;

        // Use the same calculateCrossScheduleRecord logic as ScheduleComparison
        let wins = 0;
        let losses = 0;
        let ties = 0;

        // Get the opponent's schedule (regular season only)
        Object.keys(seasonData.matchups || {}).forEach((weekKey) => {
          const weekNum = parseInt(weekKey);

          // Skip incomplete weeks
          if (!isWeekCompleted(weekNum, seasonData.league)) {
            return;
          }

          if (weekNum >= playoffWeekStart) return; // Skip playoff weeks

          const weekMatchups = (seasonData.matchups?.[
            weekKey as keyof typeof seasonData.matchups
          ] || []) as ExtendedMatchup[];

          // Find the opponent's matchup this week
          const opponentMatchup = weekMatchups.find(
            (m: ExtendedMatchup) => m.roster_id === opponentRoster.roster_id
          );

          if (!opponentMatchup) return;

          // Find who the opponent played against this week (their opponent)
          const opponentOpponent = weekMatchups.find(
            (m: ExtendedMatchup) =>
              m.matchup_id === opponentMatchup.matchup_id &&
              m.roster_id !== opponentRoster.roster_id
          );

          if (!opponentOpponent) return;

          // If the opponent's opponent is our team, we need to handle this differently
          // This means our team played the opponent this week, so we should compare our score vs the opponent's score
          if (opponentOpponent.roster_id === ownerRoster.roster_id) {
            // Get our team's score for this week
            const teamMatchup = weekMatchups.find(
              (m: ExtendedMatchup) => m.roster_id === ownerRoster.roster_id
            );
            if (!teamMatchup) return;

            // Skip if both teams have 0 points (incomplete week)
            if (teamMatchup.points === 0 && opponentMatchup.points === 0)
              return;

            // Compare our team's score vs the opponent's score (direct H2H)
            const teamScore = roundToTwoDecimals(teamMatchup.points);
            const opponentScore = roundToTwoDecimals(opponentMatchup.points);

            if (teamScore > opponentScore) {
              wins++;
            } else if (teamScore < opponentScore) {
              losses++;
            } else {
              ties++;
            }
            return;
          }

          // Get our team's score for this week
          const teamMatchup = weekMatchups.find(
            (m: ExtendedMatchup) => m.roster_id === ownerRoster.roster_id
          );
          if (!teamMatchup) return;

          // Skip if both teams have 0 points (incomplete week)
          if (teamMatchup.points === 0 && opponentOpponent.points === 0)
            return;

          // Compare our team's score vs the opponent's opponent's score
          // This simulates: if Team A played Team B's schedule, how would Team A do against Team B's opponents?
          const teamScore = roundToTwoDecimals(teamMatchup.points);
          const opponentOpponentScore = roundToTwoDecimals(
            opponentOpponent.points
          );

          if (teamScore > opponentOpponentScore) {
            wins++;
          } else if (teamScore < opponentOpponentScore) {
            losses++;
          } else {
            ties++;
          }
        });

        // Add to cross-schedule records
        crossScheduleRecords[opponentId].wins += wins;
        crossScheduleRecords[opponentId].losses += losses;
        crossScheduleRecords[opponentId].ties += ties;
      });
    });

    // Calculate win percentages
    const actualWinPercentage = calculateWinPercentage(
      totalWins,
      totalLosses,
      totalTies
    );

    Object.keys(crossScheduleRecords).forEach((opponentId) => {
      const record = crossScheduleRecords[opponentId];
      record.winPercentage = calculateWinPercentage(
        record.wins,
        record.losses,
        record.ties
      );
    });

    statsMap.set(ownerId, {
      ownerId,
      teamName,
      actualRecord: {
        wins: totalWins,
        losses: totalLosses,
        ties: totalTies,
        winPercentage: actualWinPercentage,
      },
      crossScheduleRecords,
    });
  });

  return Array.from(statsMap.values()).sort(
    (a, b) => b.actualRecord.winPercentage - a.actualRecord.winPercentage
  );
};

/**
 * The by-team table's rows: each team whose schedule the selected team could
 * have played, with the record resolved into the row once, so the table sorts
 * by reading a column rather than by reimplementing the lookup per sort field.
 */
export const buildComparisonRows = (
  allTimeStats: AllTimeScheduleComparisonStats[],
  selectedTeamStats: AllTimeScheduleComparisonStats | undefined,
  selectedTeam: string
): ComparisonRow[] => {
  if (!selectedTeamStats) return [];

  return allTimeStats.flatMap((team) => {
    const isSelectedTeam = team.ownerId === selectedTeam;
    const record = isSelectedTeam
      ? team.actualRecord
      : selectedTeamStats.crossScheduleRecords[team.ownerId];

    if (!record) return [];

    return [
      {
        ownerId: team.ownerId,
        teamName: team.teamName,
        isSelectedTeam,
        record,
        // Win percentage difference in percentage points, to 2 decimal places
        recordDifference: roundToTwoDecimals(
          (record.winPercentage -
            selectedTeamStats.actualRecord.winPercentage) *
            100
        ),
      },
    ];
  });
};
