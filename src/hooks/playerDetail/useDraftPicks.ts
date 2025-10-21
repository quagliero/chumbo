import { useMemo } from "react";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { getTeamName } from "@/utils/teamName";
import type { DraftPick } from "@/presentation/components/PlayerDetail";

export const useDraftPicks = (playerId: string | undefined) => {
  const draftPicks = useMemo(() => {
    if (!playerId) return [];

    const picks: DraftPick[] = [];

    Object.entries(seasons).forEach(([yearStr, seasonData]) => {
      const year = parseInt(yearStr);

      // Check if this season has draft data
      if (seasonData.draft && seasonData.picks) {
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
              picks.push({
                year,
                round: pick.round,
                pickNo: pick.pick_no,
                draftSlot: pick.draft_slot,
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
