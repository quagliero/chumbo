import { ExtendedRoster } from "@/types/roster";
import { BracketMatch } from "@/types/bracket";
import { getRosterPointsFor, sortTeamsByRecord } from "@/utils/recordUtils";
import type { SeasonData } from "./types";

/**
 * Where a roster placed in a season, and what it won.
 *
 * None of this depends on the data mode: a championship is a championship
 * whichever slice of the schedule the rest of the page is showing.
 */

interface TeamRecord {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
}

type TeamPoints = Pick<TeamRecord, "rosterId" | "pointsFor">;

export interface SeasonPlacement {
  finalStanding: number;
  pointsStanding: number;
  scoringCrown: boolean;
}

/**
 * Where this roster finished the season, by record and by points scored.
 *
 * Both orderings are built from a fresh copy of `seasonData.rosters`, in roster
 * order — `sortTeamsByRecord` sorts in place, and the points ranking's tiebreak
 * is whatever order it was handed.
 */
export const getSeasonPlacement = (
  seasonData: SeasonData,
  roster: ExtendedRoster
): SeasonPlacement => {
  const byRecord = sortTeamsByRecord<TeamRecord>(
    seasonData.rosters.map((r: ExtendedRoster) => ({
      rosterId: r.roster_id,
      wins: r.settings?.wins || 0,
      losses: r.settings?.losses || 0,
      ties: r.settings?.ties || 0,
      pointsFor: getRosterPointsFor(r),
    }))
  );

  const finalStanding =
    byRecord.findIndex((s) => s.rosterId === roster.roster_id) + 1;

  const byPoints: TeamPoints[] = seasonData.rosters
    .map((r: ExtendedRoster) => ({
      rosterId: r.roster_id,
      pointsFor: getRosterPointsFor(r),
    }))
    .sort((a: TeamPoints, b: TeamPoints) => b.pointsFor - a.pointsFor);

  const pointsStanding =
    byPoints.findIndex((s) => s.rosterId === roster.roster_id) + 1;

  return {
    finalStanding,
    pointsStanding,
    // The season's top scorer, from the same ordering.
    scoringCrown: byPoints[0]?.rosterId === roster.roster_id,
  };
};

/** Champion / runner-up / third place, from the winners bracket. */
export const getChampionshipResult = (
  seasonData: SeasonData,
  roster: ExtendedRoster
): "champion" | "runner-up" | "third-place" | undefined => {
  if (!seasonData.winners_bracket) return undefined;

  const championship = seasonData.winners_bracket.find(
    (m: BracketMatch) => m.p === 1
  );
  const thirdPlace = seasonData.winners_bracket.find(
    (m: BracketMatch) => m.p === 2
  );

  if (championship?.w === roster.roster_id) return "champion";
  if (
    championship?.t1 === roster.roster_id ||
    championship?.t2 === roster.roster_id
  )
    return "runner-up";
  if (thirdPlace?.w === roster.roster_id) return "third-place";

  return undefined;
};

/**
 * Did this roster make the playoffs?
 *
 * True if they played a first-round game, or had a first-round bye and turned
 * up in round 2.
 */
export const madePlayoffs = (
  seasonData: SeasonData,
  rosterId: number
): boolean => {
  if (!seasonData.winners_bracket) return false;

  const playedRound = (round: number) =>
    seasonData.winners_bracket.find(
      (bm: BracketMatch) =>
        (bm.t1 === rosterId || bm.t2 === rosterId) && bm.r === round
    );

  return !!(playedRound(1) || playedRound(2));
};
