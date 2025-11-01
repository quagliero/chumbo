import { useMemo } from "react";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { getTeamName } from "@/utils/teamName";
import type { DraftPick } from "@/presentation/components/PlayerDetail";

/**
 * Calculate the pick position within a round (sequential position 1-12, not slot number)
 * @param pickNo Overall pick number (1-indexed)
 * @param numTeams Number of teams in the draft
 * @returns Pick position within the round (1-indexed: 1st pick in round = 1, 2nd = 2, etc.)
 */
const calculatePickInRound = (pickNo: number, numTeams: number): number => {
  // Calculate which pick this is within the round (1-indexed)
  // Round 1: picks 1-12 -> positions 1-12
  // Round 2: picks 13-24 -> positions 1-12
  // etc.

  // Position within round (0-indexed)
  const positionInRound = (pickNo - 1) % numTeams;

  // Convert to 1-indexed (sequential position in round)
  return positionInRound + 1;
};

export const useDraftPicks = (playerId: string | undefined) => {
  const draftPicks = useMemo(() => {
    if (!playerId) return [];

    const picks: DraftPick[] = [];

    Object.entries(seasons).forEach(([yearStr, seasonData]) => {
      const year = parseInt(yearStr);

      // Check if this season has draft data
      if (seasonData.draft && seasonData.picks) {
        const numTeams = seasonData.draft.settings?.teams || 12;

        // Find picks for this player
        const playerPicks = seasonData.picks.filter(
          (pick) => pick.player_id === playerId
        );

        playerPicks.forEach((pick) => {
          // Find the roster/owner who made this pick
          const roster = seasonData.rosters?.find(
            (r) => r.roster_id === pick.roster_id
          );

          if (roster) {
            const manager = managers.find(
              (m) => m.sleeper.id === roster.owner_id
            );

            if (manager) {
              // Calculate the correct pick within round from pickNo
              // This ensures accuracy even if the pick was traded
              // Returns sequential position (1-12) within the round, not slot number
              const pickInRound = calculatePickInRound(pick.pick_no, numTeams);

              picks.push({
                year,
                round: pick.round,
                pickNo: pick.pick_no,
                draftSlot: pickInRound, // Use calculated value instead of draft_slot
                ownerId: roster.owner_id,
                teamName: getTeamName(roster.owner_id, seasonData.users),
                managerName: manager.name,
                position: pick.position || pick.metadata?.position,
              });
            }
          }
        });
      }
    });

    // Sort by year, then by pick number
    return picks.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return a.pickNo - b.pickNo;
    });
  }, [playerId]);

  const mostDraftedBy = useMemo(() => {
    if (draftPicks.length === 0) return null;

    const teamCounts = draftPicks.reduce((acc, pick) => {
      acc[pick.teamName] = (acc[pick.teamName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxCount = Math.max(...Object.values(teamCounts));
    const mostFrequentTeams = Object.entries(teamCounts)
      .filter(([, count]) => count === maxCount)
      .map(([teamName]) => teamName);

    return {
      teams: mostFrequentTeams,
      count: maxCount,
    };
  }, [draftPicks]);

  const draftRoundStats = useMemo(() => {
    if (draftPicks.length === 0) return null;

    const earliestRound = Math.min(...draftPicks.map((p) => p.round));
    const latestRound = Math.max(...draftPicks.map((p) => p.round));

    // Get picks for earliest round
    const earliestPicks = draftPicks.filter((p) => p.round === earliestRound);
    const earliestPickNumbers = earliestPicks.map(
      (p) => `${earliestRound}.${p.draftSlot}`
    );

    // Count occurrences of each pick number
    const earliestPickCounts = earliestPickNumbers.reduce((acc, pick) => {
      acc[pick] = (acc[pick] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Format earliest round display
    const earliestDisplay = Object.entries(earliestPickCounts)
      .map(([pick, count]) => (count > 1 ? `${pick} ${count}x` : pick))
      .sort((a, b) => a.localeCompare(b))
      .join(", ");

    // Get picks for latest round
    const latestPicks = draftPicks.filter((p) => p.round === latestRound);
    const latestPickNumbers = latestPicks.map(
      (p) => `${latestRound}.${p.draftSlot}`
    );

    // Count occurrences of each pick number
    const latestPickCounts = latestPickNumbers.reduce((acc, pick) => {
      acc[pick] = (acc[pick] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Format latest round display
    const latestDisplay = Object.entries(latestPickCounts)
      .map(([pick, count]) => (count > 1 ? `${pick} ${count}x` : pick))
      .join(", ");

    return {
      earliestRound,
      latestRound,
      earliestDisplay,
      latestDisplay,
    };
  }, [draftPicks]);

  return {
    draftPicks,
    mostDraftedBy,
    draftRoundStats,
  };
};
