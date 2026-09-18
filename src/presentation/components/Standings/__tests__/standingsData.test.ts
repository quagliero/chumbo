import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { CURRENT_YEAR, YEARS } from "@/domain/constants";
import { ExtendedRoster } from "@/types/roster";
import { getTeamName } from "@/utils/teamName";
import {
  calculateDivisionRecord,
  calculateH2HRecord,
} from "@/utils/recordUtils";
import {
  buildTableData,
  groupStandings,
  sortDivisions,
} from "../standingsData";
import { getPlayoffTeams } from "../playoffSeeding";
import {
  getBottomScorer,
  getChampionshipHistory,
  getScumbo,
  getTopScorer,
} from "../awards";

/**
 * Pins the season standings page's computation (H2).
 *
 * Division order, tiebreaks, playoff seeds, the table's rows and the three
 * award cards used to be worked out inline in `Standings.tsx`. The snapshots
 * were recorded from the code moved out of it, verbatim, before the page was
 * switched over to call it, and the page rendered identically for every
 * season before and after.
 *
 * `season()` below wires the pieces together the way the component does,
 * including the three small closures it keeps for itself. Completed seasons
 * only, so the snapshot does not move every time a week of the live season is
 * fetched.
 */

/** The same `standings` prop `history.tsx` passes: rosters by win %, then points. */
const standingsFor = (year: number): ExtendedRoster[] =>
  [...seasons[year].rosters].sort((a, b) => {
    const aWinPerc =
      a.settings.wins / (a.settings.wins + a.settings.losses + a.settings.ties);
    const bWinPerc =
      b.settings.wins / (b.settings.wins + b.settings.losses + b.settings.ties);
    if (aWinPerc !== bWinPerc) return bWinPerc - aWinPerc;
    const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
    const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
    return bPoints - aPoints;
  });

const season = (year: number) => {
  const { league, winners_bracket: winnersBracket, matchups, users } =
    seasons[year];
  const standings = standingsFor(year);
  const playoffWeekStart = league?.settings?.playoff_week_start || 15;
  const isSeasonComplete = league?.status === "complete";
  const hasDivisions = !!(
    league?.settings?.divisions && league.settings.divisions > 0
  );

  const getH2HRecord = (team1: ExtendedRoster, team2: ExtendedRoster) =>
    calculateH2HRecord(
      team1.roster_id,
      team2.roster_id,
      matchups,
      playoffWeekStart
    );
  const getDivisionRecord = (
    team: ExtendedRoster,
    divisionTeams: ExtendedRoster[]
  ) =>
    calculateDivisionRecord(team, divisionTeams, matchups, playoffWeekStart);

  const sortedDivisions = sortDivisions(
    groupStandings(standings, hasDivisions),
    hasDivisions,
    year,
    getH2HRecord,
    getDivisionRecord
  );
  const firstPlace = winnersBracket?.find((m) => m.p === 1);
  const thirdPlace = winnersBracket?.find((m) => m.p === 3);
  const { playoffTeams, playoffTeamSeeds } = getPlayoffTeams(
    winnersBracket,
    league,
    standings,
    hasDivisions
  );
  const getPlayoffHighlight = (rosterId: number) => {
    if (!playoffTeams.has(rosterId)) return null;
    if ((league?.settings?.num_teams || 12) === 10) return "playoff";
    return playoffTeamSeeds[rosterId] <= 2 ? "bye" : "playoff";
  };
  const topScorer = getTopScorer(standings);
  const bottomScorer = getBottomScorer(standings);
  const scumbo = getScumbo(year, standings);
  const championRoster = standings.find((r) => r.roster_id === firstPlace?.w);

  const divisions = sortedDivisions.map(({ division, teams }) => ({
    division,
    rows: buildTableData(teams, {
      hasDivisions,
      standings,
      getTeamName: (ownerId: string) => getTeamName(ownerId, users),
      strengthOfScheduleRemaining: {},
      isSeasonComplete,
      firstPlace,
      thirdPlace,
      topScorer,
      bottomScorer,
      getPlayoffHighlight,
      getDivisionRecord,
    }),
  }));

  return {
    divisions: divisions.map(({ division, rows }) => ({
      division,
      // One line per row, so a moved tiebreak shows as a moved line.
      rows: rows.map((row) =>
        [
          row.rank,
          row.roster.owner_id,
          `${row.wins}-${row.losses}-${row.ties}`,
          row.winPerc.toFixed(3),
          row.divisionRecord
            ? `div ${row.divisionRecord.wins}-${row.divisionRecord.losses}-${row.divisionRecord.ties}`
            : "",
          row.pointsFor.toFixed(2),
          row.pointsAgainst.toFixed(2),
          row.avgPointsFor.toFixed(2),
          row.avgPointsAgainst.toFixed(2),
          row.playoffHighlight ?? "",
          row.isChampion ? "champion" : "",
          row.isRunnerUp ? "runner-up" : "",
          row.isThirdPlace ? "third" : "",
          row.isTopScorer ? "top" : "",
          row.isBottomScorer ? "bottom" : "",
        ]
          .filter((part) => part !== "")
          .join(" ")
      ),
    })),
    seeds: playoffTeamSeeds,
    topScorer: topScorer.owner_id,
    bottomScorer: bottomScorer.owner_id,
    scumbo: scumbo && {
      ownerId: scumbo.roster?.owner_id,
      record: `${scumbo.leagueWins}-${scumbo.leagueLosses}-${scumbo.leagueTies}`,
    },
    championshipHistory: getChampionshipHistory(championRoster, year),
  };
};

const COMPLETED = YEARS.filter((year) => year !== CURRENT_YEAR);

describe("season standings", () => {
  it.each(COMPLETED)("%s", (year) => {
    expect(season(year)).toMatchSnapshot();
  });

  it("leaves the caller's standings array alone", () => {
    // It used to sort in place, and with no divisions the single group WAS
    // the caller's array, so rendering the table re-sorted the page's data.
    const standings = standingsFor(2012);
    const before = standings.map((r) => r.roster_id);
    const [group] = sortDivisions(
      groupStandings(standings, false),
      false,
      2012,
      () => ({ wins: 0, losses: 0, ties: 0 }),
      () => ({ wins: 0, losses: 0, ties: 0 })
    );
    expect(group.teams).not.toBe(standings);
    expect(standings.map((r) => r.roster_id)).toEqual(before);
  });

  it("orders a season before its first game without NaN", () => {
    // Every team 0-0: `wins / games` was 0/0, and a comparator returning NaN
    // leaves the order to the engine. Now it falls through to points.
    const fresh = standingsFor(2012).map((r) => ({
      ...r,
      settings: { ...r.settings, wins: 0, losses: 0, ties: 0 },
    }));
    const [group] = sortDivisions(
      groupStandings(fresh, false),
      false,
      2012,
      () => ({ wins: 0, losses: 0, ties: 0 }),
      () => ({ wins: 0, losses: 0, ties: 0 })
    );
    const points = group.teams.map(
      (r) => r.settings.fpts + r.settings.fpts_decimal / 100
    );
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("counts a tie as half a win", () => {
    // 2015: two teams went 7-5-1. They showed .538 — the same as 7-6-0, as
    // if the tie were a loss. Half a win is .577, as Sleeper and the rest of
    // this site count it.
    const rows = JSON.stringify(season(2015));
    expect(rows).toMatch(/7-5-1 0\.577/);
    expect(rows).not.toMatch(/7-5-1 0\.538/);
  });
});

describe("getChampionshipHistory", () => {
  it("has nothing to say without a champion", () => {
    expect(getChampionshipHistory(undefined, 2020)).toBeNull();
  });
});
