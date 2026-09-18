import { useFormatter } from "use-intl";
import { Link } from "react-router-dom";
import { useMemo, useCallback } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ExtendedRoster } from "@/types/roster";
import { BracketMatch } from "@/types/bracket";
import { getSeasonBreakdown } from "@/utils/seasonBreakdown";
import { League, ExtendedLeague } from "@/types/league";
import { ExtendedUser } from "@/types/user";
import { ExtendedMatchup, ScheduledMatchup } from "@/types/matchup";
import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import {
  calculateH2HRecord,
  calculateDivisionRecord,
} from "@/utils/recordUtils";
import { calculateStrengthOfSchedule } from "@/utils/strengthOfSchedule";
import { seasons } from "@/data";
import { DataTable } from "../Table";
import type { AnyColumnDef } from "../Table";
import { YEARS } from "@/domain/constants";
import { ManagerIdentity } from "@/presentation/components/ManagerIdentity";

// One table per division. Kept as its own component because each needs its own
// table instance.
const DivisionTable = ({
  division,
  data,
  columns,
  hasDivisions,
  getDivisionInfo,
}: {
  division: number;
  data: TeamStandingData[];
  columns: AnyColumnDef<TeamStandingData>[];
  hasDivisions: boolean;
  getDivisionInfo: (division: number) => {
    name: string;
    avatar: string | null;
  };
}) => (
  <div className={hasDivisions ? "mb-8" : ""}>
    {hasDivisions && (
      <div>
        <h2 className="text-xl font-bold text-ink mb-2 flex items-center">
          {(() => {
            const divisionInfo = getDivisionInfo(division);
            return (
              <>
                {divisionInfo.avatar && (
                  <img
                    src={divisionInfo.avatar}
                    alt={`${divisionInfo.name} avatar`}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                )}
                {divisionInfo.name}
              </>
            );
          })()}
        </h2>
        <div className="border-b-2 border-line-strong"></div>
      </div>
    )}
    <DataTable
      columns={columns}
      data={data}
      // Rank and team together are the row's identity; pinning the rank alone
      // would leave a phone scrolling numbers with no name against them.
      stickyColumns={2}
      // Playoff seeding already colours rows; zebra on top of it reads as noise.
      zebra={false}
      // Legacy Tailwind palette, deliberately — see the note in AllTimeTable.
      // These are the exact colours the table had before.
      getRowBackground={(row) =>
        row.original.playoffHighlight === "bye"
          ? "bg-green-50"
          : row.original.playoffHighlight === "playoff"
          ? "bg-yellow-50"
          : undefined
      }
      getRowClassName={(row) =>
        row.original.playoffHighlight === "bye"
          ? "border-l-4 border-green-500"
          : row.original.playoffHighlight === "playoff"
          ? "border-l-4 border-yellow-500"
          : ""
      }
      emptyMessage="No standings for this season yet."
    />
  </div>
);

interface StandingsProps {
  standings: ExtendedRoster[];
  getTeamName: (ownerId: string) => string;
  league: League | undefined;
  winnersBracket: BracketMatch[] | undefined;
  users?: ExtendedUser[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matchups?: Record<string, any[]>; // For league record calculations
  currentYear?: number; // Current year being viewed
}

interface TeamStandingData {
  roster: ExtendedRoster;
  rank: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  winPerc: number;
  divisionRecord?: { wins: number; losses: number; ties: number };
  pointsFor: number;
  pointsAgainst: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  sosRank?: number;
  playoffHighlight?: string | null;
  isChampion?: boolean;
  isRunnerUp?: boolean;
  isThirdPlace?: boolean;
  isTopScorer?: boolean;
  isBottomScorer?: boolean;
}

const Standings = ({
  standings,
  getTeamName,
  league,
  winnersBracket,
  users,
  matchups,
  currentYear,
}: StandingsProps) => {
  const { number } = useFormatter();
  const columnHelper = createColumnHelper<TeamStandingData>();

  // Only show awards if season is complete
  const isSeasonComplete = league?.status === "complete";

  // Check if divisions are used
  const hasDivisions = !!(
    league?.settings?.divisions && league.settings.divisions > 0
  );

  // Get division names and avatars from metadata
  const getDivisionInfo = (divisionNumber: number) => {
    if (!hasDivisions || !league.metadata) {
      return { name: `Division ${divisionNumber}`, avatar: null };
    }

    const divisionKey =
      `division_${divisionNumber}` as keyof typeof league.metadata;
    const avatarKey =
      `division_${divisionNumber}_avatar` as keyof typeof league.metadata;

    return {
      name: league.metadata[divisionKey] || `Division ${divisionNumber}`,
      avatar: league.metadata[avatarKey] || null,
    };
  };

  // Group standings by division if divisions exist
  const groupedStandings = hasDivisions
    ? standings.reduce((acc, roster) => {
        const division = roster.settings.division || 1;
        if (!acc[division]) {
          acc[division] = [];
        }
        acc[division].push(roster);
        return acc;
      }, {} as Record<number, ExtendedRoster[]>)
    : { 0: standings }; // Single group when no divisions

  // Calculate H2H record between two teams
  const getH2HRecord = (team1: ExtendedRoster, team2: ExtendedRoster) => {
    if (!matchups) return { wins: 0, losses: 0, ties: 0 };

    const playoffWeekStart = league?.settings?.playoff_week_start || 15;
    return calculateH2HRecord(
      team1.roster_id,
      team2.roster_id,
      matchups,
      playoffWeekStart
    );
  };

  // Calculate division record for a team
  const getDivisionRecord = useCallback(
    (team: ExtendedRoster, divisionTeams: ExtendedRoster[]) => {
      if (!matchups) return { wins: 0, losses: 0, ties: 0 };

      const playoffWeekStart = league?.settings?.playoff_week_start || 15;
      return calculateDivisionRecord(
        team,
        divisionTeams,
        matchups,
        playoffWeekStart
      );
    },
    [matchups, league?.settings?.playoff_week_start]
  );

  // Sort divisions and teams within each division
  const sortedDivisions = Object.entries(groupedStandings)
    .map(([division, teams]) => ({
      division: parseInt(division),
      teams: teams.sort((a, b) => {
        const aWinPct =
          a.settings.wins /
          (a.settings.wins + a.settings.losses + a.settings.ties);
        const bWinPct =
          b.settings.wins /
          (b.settings.wins + b.settings.losses + b.settings.ties);

        // First tiebreaker: Win percentage
        if (aWinPct !== bWinPct) return bWinPct - aWinPct;

        // For division years, use division-specific tiebreakers
        if (hasDivisions) {
          // Second tiebreaker: H2H record
          const h2hRecord = getH2HRecord(a, b);
          const totalH2HGames =
            h2hRecord.wins + h2hRecord.losses + h2hRecord.ties;

          // Only use H2H if teams actually played each other
          if (totalH2HGames > 0 && h2hRecord.wins !== h2hRecord.losses) {
            return h2hRecord.losses - h2hRecord.wins; // Team A wins if they have more H2H wins
          }

          // Third tiebreaker: Division record
          const aDivRecord = getDivisionRecord(a, teams);
          const bDivRecord = getDivisionRecord(b, teams);
          const aDivWinPct =
            aDivRecord.wins /
            (aDivRecord.wins + aDivRecord.losses + aDivRecord.ties);
          const bDivWinPct =
            bDivRecord.wins /
            (bDivRecord.wins + bDivRecord.losses + bDivRecord.ties);

          if (aDivWinPct !== bDivWinPct) return bDivWinPct - aDivWinPct;
        } else {
          // For non-division years, only use H2H for 2012
          if (currentYear === 2012) {
            const h2hRecord = getH2HRecord(a, b);
            const totalH2HGames =
              h2hRecord.wins + h2hRecord.losses + h2hRecord.ties;

            // Only use H2H if teams actually played each other
            if (totalH2HGames > 0 && h2hRecord.wins !== h2hRecord.losses) {
              return h2hRecord.losses - h2hRecord.wins; // Team A wins if they have more H2H wins
            }
          }
        }

        // Final tiebreaker: Points
        const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
        const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
        return bPoints - aPoints;
      }),
    }))
    .sort((a, b) => a.division - b.division);

  // Get playoff placements
  const firstPlace = winnersBracket?.find((m) => m.p === 1);
  const thirdPlace = winnersBracket?.find((m) => m.p === 3);

  // Determine playoff teams and their seeding by analyzing bracket structure
  const getPlayoffTeams = () => {
    if (!winnersBracket || !league?.settings?.playoff_teams) {
      return { playoffTeams: new Set<number>(), playoffTeamSeeds: {} };
    }

    const playoffTeams = new Set<number>();
    const playoffTeamSeeds: Record<number, number> = {};

    // Get all teams that appear in the winners bracket (these are the playoff teams)
    winnersBracket.forEach((match) => {
      if (match.t1) playoffTeams.add(match.t1);
      if (match.t2) playoffTeams.add(match.t2);
    });

    if (hasDivisions) {
      // For division-based leagues, analyze bracket structure to determine seeds
      // Find teams that get byes (don't appear in first round)
      const firstRoundTeams = new Set<number>();
      const byeTeams = new Set<number>();

      // Find the first round (lowest round number)
      const firstRound = Math.min(...winnersBracket.map((m) => m.r));

      winnersBracket.forEach((match) => {
        if (match.r === firstRound) {
          if (match.t1) firstRoundTeams.add(match.t1);
          if (match.t2) firstRoundTeams.add(match.t2);
        }
      });

      // Teams with byes are playoff teams that don't appear in first round
      playoffTeams.forEach((teamId) => {
        if (!firstRoundTeams.has(teamId)) {
          byeTeams.add(teamId);
        }
      });

      // Assign seeds 1-2 to bye teams (division winners, sorted by their division standings)
      const byeTeamRosters = [...standings]
        .filter((r) => byeTeams.has(r.roster_id))
        .sort((a, b) => {
          const aWinPct =
            a.settings.wins /
            (a.settings.wins + a.settings.losses + a.settings.ties);
          const bWinPct =
            b.settings.wins /
            (b.settings.wins + b.settings.losses + b.settings.ties);

          if (aWinPct !== bWinPct) return bWinPct - aWinPct;

          const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
          const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
          return bPoints - aPoints;
        });

      let seed = 1;
      byeTeamRosters.forEach((roster) => {
        playoffTeamSeeds[roster.roster_id] = seed;
        seed++;
      });

      // Assign seeds 3-6 to remaining playoff teams (first round participants)
      const firstRoundRosters = [...standings]
        .filter((r) => firstRoundTeams.has(r.roster_id))
        .sort((a, b) => {
          const aWinPct =
            a.settings.wins /
            (a.settings.wins + a.settings.losses + a.settings.ties);
          const bWinPct =
            b.settings.wins /
            (b.settings.wins + b.settings.losses + b.settings.ties);

          if (aWinPct !== bWinPct) return bWinPct - aWinPct;

          const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
          const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
          return bPoints - aPoints;
        });

      firstRoundRosters.forEach((roster) => {
        playoffTeamSeeds[roster.roster_id] = seed;
        seed++;
      });
    } else {
      // For non-division leagues, use simple overall standings
      const sortedStandings = [...standings].sort((a, b) => {
        const aWinPct =
          a.settings.wins /
          (a.settings.wins + a.settings.losses + a.settings.ties);
        const bWinPct =
          b.settings.wins /
          (b.settings.wins + b.settings.losses + b.settings.ties);

        if (aWinPct !== bWinPct) return bWinPct - aWinPct;

        const aPoints = a.settings.fpts + a.settings.fpts_decimal / 100;
        const bPoints = b.settings.fpts + b.settings.fpts_decimal / 100;
        return bPoints - aPoints;
      });

      let seed = 1;
      sortedStandings.forEach((roster) => {
        if (playoffTeams.has(roster.roster_id)) {
          playoffTeamSeeds[roster.roster_id] = seed;
          seed++;
        }
      });
    }

    return { playoffTeams, playoffTeamSeeds };
  };

  const { playoffTeams, playoffTeamSeeds } = getPlayoffTeams();

  // Calculate strength of schedule remaining for current season only.
  // The unplayed fixtures live in schedule.json, not in the matchup files, so
  // the season's schedule has to go in alongside the matchups.
  const strengthOfScheduleRemaining = useMemo(() => {
    return currentYear && currentYear >= YEARS[YEARS.length - 1]
      ? calculateStrengthOfSchedule({
          matchups: matchups || {},
          rosters: standings,
          league: league || ({} as League),
          schedule: seasons[currentYear]?.schedule,
        } as {
          matchups: Record<string, ExtendedMatchup[]>;
          rosters: ExtendedRoster[];
          league: ExtendedLeague;
          schedule?: Record<string, ScheduledMatchup[]>;
        })
      : {};
  }, [currentYear, matchups, standings, league]);

  // `calculateStrengthOfSchedule` returns {} whenever there is no remaining
  // schedule to rank — every completed season, and the live season once the
  // regular season is done. In that case the column has nothing to say, so
  // drop it rather than render a column of dashes.
  const hasStrengthOfSchedule =
    Object.keys(strengthOfScheduleRemaining).length > 0;

  // Create table columns
  const columns = useMemo(
    () => [
      columnHelper.accessor("rank", {
        header: () => "Rank",
        cell: (info) => {
          const row = info.row.original;
          let rankText = info.getValue().toString();
          if (row.isChampion) rankText += " 🥇";
          if (row.isRunnerUp) rankText += " 🥈";
          if (row.isThirdPlace) rankText += " 🥉";
          if (row.isTopScorer) rankText += " 🎯";
          if (row.isBottomScorer) rankText += " 💩";
          return <span className="font-medium">{rankText}</span>;
        },
        enableSorting: false,
        meta: { cellClassName: "whitespace-nowrap w-12" },
      }),
      columnHelper.accessor("teamName", {
        header: () => "Team",
        cell: (info) => {
          const row = info.row.original;
          const user = getUserByOwnerId(row.roster.owner_id, users);
          const avatarUrl = getUserAvatarUrl(user);
          const teamName = info.getValue();

          return (
            <ManagerIdentity
              ownerId={row.roster.owner_id}
              teamName={teamName}
              avatarUrl={avatarUrl}
            />
          );
        },
        enableSorting: false,
        meta: {
          kind: "manager" as const,
          ownerId: (row: TeamStandingData) => row.roster.owner_id,
        },
      }),
      columnHelper.accessor("wins", {
        header: () => "W",
        cell: (info) => info.getValue(),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "numeric" as const },
      }),
      columnHelper.accessor("losses", {
        header: () => "L",
        cell: (info) => info.getValue(),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "numeric" as const },
      }),
      columnHelper.accessor("ties", {
        header: () => "T",
        cell: (info) => info.getValue(),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "numeric" as const },
      }),
      columnHelper.accessor("winPerc", {
        header: () => "Win %",
        cell: (info) => {
          const formatted = number(info.getValue(), {
            maximumFractionDigits: 3,
            minimumFractionDigits: 3,
          });
          return formatted.startsWith("0.") ? formatted.substring(1) : formatted;
        },
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "numeric" as const },
      }),
      ...(hasDivisions
        ? [
            columnHelper.accessor("divisionRecord", {
              header: () => "Div Record",
              cell: (info) => {
                const record = info.getValue();
                if (!record) return "-";
                return `${record.wins}-${record.losses}${
                  record.ties > 0 ? `-${record.ties}` : ""
                }`;
              },
              enableSorting: false,
              meta: { kind: "record" as const, cellClassName: "text-xs" },
            }),
          ]
        : []),
      columnHelper.accessor("pointsFor", {
        header: () => "Points For",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "points" as const },
      }),
      columnHelper.accessor("avgPointsFor", {
        header: () => "Avg For",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "points" as const },
      }),
      columnHelper.accessor("pointsAgainst", {
        header: () => "Points Against",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "points" as const },
      }),
      columnHelper.accessor("avgPointsAgainst", {
        header: () => "Avg Against",
        cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
        sortingFn: "alphanumeric",
        enableSorting: true,
        meta: { kind: "points" as const },
      }),
      ...(hasStrengthOfSchedule
        ? [
            columnHelper.accessor("sosRank", {
              header: () => "SOS",
              cell: (info) => {
                const sosRank = info.getValue();
                if (!sosRank) return "-";

                const normalized = (sosRank - 1) / 11;
                const red = Math.round(255 * (1 - normalized));
                const green = Math.round(255 * normalized);
                const blue = 0;
                const color = `rgb(${red}, ${green}, ${blue})`;

                return (
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold text-sm"
                    style={{ backgroundColor: color }}
                  >
                    {sosRank}
                  </span>
                );
              },
              sortingFn: "alphanumeric",
              enableSorting: true,
              meta: { align: "center" as const },
            }),
          ]
        : []),
    ],
    [columnHelper, hasDivisions, number, users, hasStrengthOfSchedule]
  );

  // Determine if a team gets a bye (top 2 seeds in 12-team leagues, or all playoff teams in 10-team leagues)
  const getPlayoffHighlight = useCallback(
    (rosterId: number) => {
      if (!playoffTeams.has(rosterId)) return null;

      const seed = playoffTeamSeeds[rosterId];
      const numTeams = league?.settings?.num_teams || 12;

      // In 10-team leagues, all playoff teams get green (no byes)
      if (numTeams === 10) {
        return "playoff";
      }

      // In 12-team leagues, top 2 seeds get byes (green), others get yellow
      if (seed <= 2) {
        return "bye";
      } else {
        return "playoff";
      }
    },
    [playoffTeams, playoffTeamSeeds, league?.settings?.num_teams]
  );

  // Get top scorer
  const topScorer = standings.reduce((max, r) => {
    const rPoints = r.settings.fpts + r.settings.fpts_decimal / 100;
    const maxPoints = max.settings.fpts + max.settings.fpts_decimal / 100;
    return rPoints > maxPoints ? r : max;
  });

  // Get bottom scorer
  const bottomScorer = standings.reduce((min, r) => {
    const rPoints = r.settings.fpts + r.settings.fpts_decimal / 100;
    const minPoints = min.settings.fpts + min.settings.fpts_decimal / 100;
    return rPoints < minPoints ? r : min;
  });

  // The Scumbo: the worst BREAKDOWN of the season.
  //
  // Comes from the shared `getSeasonBreakdown` rather than a local sum, so this
  // card and the Hall of Fame's Ring of Shame cannot name different people —
  // which they did. The local version counted EVERY week in `matchups`,
  // playoffs included, and that is not an all-play record: in a playoff week the
  // consolation bracket is being compared against the championship bracket and
  // the league is no longer playing a common schedule. It changed the holder in
  // two of fourteen seasons (2013 and 2023, htc rather than kitch).
  //
  // Regular season only is also what the Breakdown tab shows, and "breakdown"
  // is the word the league uses for this award.
  const breakdown = currentYear ? getSeasonBreakdown(currentYear) : [];
  const worstBreakdown = breakdown[breakdown.length - 1];
  const scumbo = worstBreakdown
    ? {
        roster: standings.find((r) => r.roster_id === worstBreakdown.rosterId),
        leagueWins: worstBreakdown.wins,
        leagueLosses: worstBreakdown.losses,
        leagueTies: worstBreakdown.ties,
      }
    : null;

  // Create table data for each division
  const createTableData = useCallback(
    (teams: ExtendedRoster[]) => {
      return teams.map((roster, index) => {
        const winPerc =
          roster.settings.wins /
          (roster.settings.wins +
            roster.settings.losses +
            roster.settings.ties);
        const pointsFor =
          roster.settings.fpts + roster.settings.fpts_decimal / 100;
        const pointsAgainst =
          roster.settings.fpts_against +
          roster.settings.fpts_against_decimal / 100;

        // Calculate average points (total games played)
        const totalGames =
          roster.settings.wins + roster.settings.losses + roster.settings.ties;
        const avgPointsFor = totalGames > 0 ? pointsFor / totalGames : 0;
        const avgPointsAgainst =
          totalGames > 0 ? pointsAgainst / totalGames : 0;

        // Calculate division record if divisions exist
        const divisionRecord = hasDivisions
          ? getDivisionRecord(
              roster,
              standings.filter(
                (t) =>
                  (t.settings.division || 1) === (roster.settings.division || 1)
              )
            )
          : undefined;

        const playoffHighlight = getPlayoffHighlight(roster.roster_id);
        const isChampion =
          isSeasonComplete && firstPlace?.w === roster.roster_id;
        const isRunnerUp =
          isSeasonComplete && firstPlace?.l === roster.roster_id;
        const isThirdPlace =
          isSeasonComplete && thirdPlace?.w === roster.roster_id;
        const isTopScorer =
          isSeasonComplete && roster.roster_id === topScorer.roster_id;
        const isBottomScorer =
          isSeasonComplete && roster.roster_id === bottomScorer.roster_id;

        return {
          roster,
          rank: index + 1,
          teamName: getTeamName(roster.owner_id),
          wins: roster.settings.wins,
          losses: roster.settings.losses,
          ties: roster.settings.ties,
          winPerc,
          divisionRecord,
          pointsFor,
          pointsAgainst,
          avgPointsFor,
          avgPointsAgainst,
          sosRank: strengthOfScheduleRemaining[roster.roster_id],
          playoffHighlight,
          isChampion,
          isRunnerUp,
          isThirdPlace,
          isTopScorer,
          isBottomScorer,
        };
      });
    },
    [
      hasDivisions,
      standings,
      getTeamName,
      strengthOfScheduleRemaining,
      isSeasonComplete,
      firstPlace,
      thirdPlace,
      topScorer,
      bottomScorer,
      getPlayoffHighlight,
      getDivisionRecord,
    ]
  );
  const divisionTableData = useMemo(() => {
    return sortedDivisions.map(({ division, teams }) => ({
      division,
      teams,
      data: createTableData(teams),
    }));
  }, [sortedDivisions, createTableData]);

  return (
    <div className="container mx-auto">
      {divisionTableData.map(({ division, data }) => (
        <DivisionTable
          key={division}
          division={division}
          data={data}
          columns={columns}
          hasDivisions={hasDivisions}
          getDivisionInfo={getDivisionInfo}
        />
      ))}

      {/* Awards Grid */}
      {isSeasonComplete && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Champion */}
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-6 rounded-lg border-2 border-yellow-200">
            <div className="text-center">
              <div className="text-4xl mb-2">🏆</div>
              <h3 className="text-lg font-bold text-yellow-800 mb-2">
                Champion
              </h3>
              {(() => {
                const championRoster = standings.find(
                  (r) => r.roster_id === firstPlace?.w
                );
                const championManagerId = championRoster
                  ? getManagerIdBySleeperOwnerId(championRoster.owner_id)
                  : null;
                const championName = championRoster
                  ? getTeamName(championRoster.owner_id)
                  : "TBD";

                // Calculate championship history
                const championshipHistory = () => {
                  if (!championRoster) return null;

                  // Every season up to this one: the history page loads exactly
                  // those for this card (A2b). Test the year BEFORE touching
                  // the season, because reading a later season's bracket is a
                  // read of data nobody asked for, and it would be fetched.
                  const allChampionships = Object.entries(seasons)
                    .filter(([year, season]) => {
                      const yearNum = parseInt(year);
                      // Only include years up to and including the current year
                      return (
                        (!currentYear || yearNum <= currentYear) &&
                        season?.winners_bracket
                      );
                    })
                    .map(([year, season]) => {
                      const championship = season.winners_bracket.find(
                        (m) => m.p === 1
                      );
                      if (!championship) return null;

                      // Find the roster that won the championship
                      const winningRoster = season.rosters?.find(
                        (r) => r.roster_id === championship.w
                      );

                      return winningRoster
                        ? {
                            year: parseInt(year),
                            ownerId: winningRoster.owner_id,
                          }
                        : null;
                    })
                    .filter(Boolean);

                  const thisManagerChampionships = allChampionships
                    .filter(
                      (champ) => champ?.ownerId === championRoster.owner_id
                    )
                    .map((champ) => champ!.year)
                    .sort((a, b) => a - b);

                  const previousYears = thisManagerChampionships.filter(
                    (year) => year !== currentYear
                  );
                  const winCount = thisManagerChampionships.length;

                  if (winCount === 1) {
                    return "First win";
                  } else if (winCount === 2) {
                    return `Second win (${previousYears.join(", ")})`;
                  } else if (winCount === 3) {
                    return `Third win (${previousYears.join(", ")})`;
                  } else {
                    return `${winCount}th win (${previousYears.join(", ")})`;
                  }
                };

                return championManagerId ? (
                  <div>
                    <Link
                      to={`/managers/${championManagerId}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
                    >
                      {championName}
                    </Link>
                    <div className="text-sm text-yellow-600 mt-1">
                      {championshipHistory()}
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="font-semibold">{championName}</span>
                    <div className="text-sm text-yellow-600 mt-1">
                      {championshipHistory()}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Scoring Crown */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border-2 border-purple-200">
            <div className="text-center">
              <div className="text-4xl mb-2">👑</div>
              <h3 className="text-lg font-bold text-purple-800 mb-2">
                Scoring Crown
              </h3>
              {(() => {
                const scoringCrownManagerId = getManagerIdBySleeperOwnerId(
                  topScorer.owner_id
                );
                const scoringCrownName = getTeamName(topScorer.owner_id);

                return scoringCrownManagerId ? (
                  <Link
                    to={`/managers/${scoringCrownManagerId}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
                  >
                    {scoringCrownName}
                  </Link>
                ) : (
                  <span className="font-semibold">{scoringCrownName}</span>
                );
              })()}
              <div className="text-sm text-purple-600 mt-1">
                {number(
                  (topScorer.settings.fpts +
                    topScorer.settings.fpts_decimal / 100) /
                    (topScorer.settings.wins +
                      topScorer.settings.losses +
                      topScorer.settings.ties),
                  { maximumFractionDigits: 2 }
                )}{" "}
                points per game
              </div>
            </div>
          </div>

          {/* Scumbo */}
          <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-lg border-2 border-red-200">
            <div className="text-center">
              <div className="text-4xl mb-2">💩</div>
              <h3 className="text-lg font-bold text-red-800 mb-2">Scumbo</h3>
              {(() => {
                if (!scumbo?.roster) return <span className="font-semibold">—</span>;
                const scumboManagerId = getManagerIdBySleeperOwnerId(
                  scumbo.roster.owner_id
                );
                const scumboName = getTeamName(scumbo.roster.owner_id);

                return scumboManagerId ? (
                  <Link
                    to={`/managers/${scumboManagerId}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
                  >
                    {scumboName}
                  </Link>
                ) : (
                  <span className="font-semibold">{scumboName}</span>
                );
              })()}
              <div className="text-sm text-red-600 mt-1">
                {scumbo ? (
                  <>
                    {scumbo.leagueWins}-{scumbo.leagueLosses}
                    {scumbo.leagueTies > 0 && `-${scumbo.leagueTies}`} league record
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Standings;
