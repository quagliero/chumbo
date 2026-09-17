import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { seasons, managers, getPlayer } from "@/data";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getPlayerImageUrl } from "@/utils/playerImage";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup } from "@/types/matchup";
import { BracketMatch } from "@/types/bracket";
import {
  getPlayoffWeekStart,
  isPlayoffWeek,
  isRegularSeasonWeek,
} from "@/utils/playoffUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import { getPlayerPositionComprehensive } from "@/utils/playerDataUtils";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "../Table";
import { ValidYear } from "@/domain/constants";
import { Card } from "@/presentation/components/Card";

interface H2HMatchup {
  year: number;
  week: number;
  matchupId: string | null;
  managerAPoints: number;
  managerBPoints: number;
  result: "W" | "L" | "T";
  isPlayoff: boolean;
}

/**
 * Which playoff round a week was. The bracket shape changed when the league
 * went from four playoff teams to six, so this has to be read off that
 * season's settings rather than counted back from the end.
 */
const playoffRoundLabel = (year: number, week: number): string => {
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

/** A player photo, or his initial where there is no photo to show. */
const PlayerAvatar = ({
  playerId,
  playerName,
  square = false,
}: {
  playerId: string;
  playerName: string;
  /** Team defences are crests, not headshots, and should not be circled. */
  square?: boolean;
}) => {
  const imageUrl = getPlayerImageUrl(playerId);

  return imageUrl ? (
    <img
      src={imageUrl}
      alt={`${playerName} photo`}
      className={`w-6 h-6 flex-none object-cover ${square ? "" : "rounded-full"}`}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  ) : (
    <div className="w-6 h-6 rounded-full bg-line flex items-center justify-center text-xs font-bold text-ink-muted">
      {(playerName || "?").charAt(0).toUpperCase()}
    </div>
  );
};

const Pill = ({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) => (
  <span className={`px-2 py-1 rounded text-xs ${className}`}>{children}</span>
);

const matchupColumnHelper = createColumnHelper<H2HMatchup>();

interface H2HContentProps {
  managerA: string;
  managerB: string;
}

export default function H2HContent({ managerA, managerB }: H2HContentProps) {
  // A2a: the matchups are a lazy chunk now; suspend until they are in.
  useAllSeasons();
  const [showAllRegularSeason, setShowAllRegularSeason] = useState(false);
  const { number } = useFormatter();

  const h2hData = useMemo(() => {
    const managerAData = managers.find((m) => m.id === managerA);
    const managerBData = managers.find((m) => m.id === managerB);

    if (!managerAData || !managerBData) return null;

    const regularSeasonMatchups: H2HMatchup[] = [];
    const playoffMatchups: H2HMatchup[] = [];

    // New approach: collect player scores by player name for each manager
    const managerAPlayerScores: Map<
      string,
      Array<{
        score: number;
        year: number;
        week: number;
        result: string;
        playerId: string;
      }>
    > = new Map();
    const managerBPlayerScores: Map<
      string,
      Array<{
        score: number;
        year: number;
        week: number;
        result: string;
        playerId: string;
      }>
    > = new Map();

    // Process all seasons
    Object.entries(seasons).forEach(([yearStr, seasonData]) => {
      const year = parseInt(yearStr) as ValidYear;

      // Find rosters for both managers (using sleeper IDs)
      const managerARoster = seasonData.rosters.find(
        (r: ExtendedRoster) => r.owner_id === managerAData.sleeper.id
      );
      const managerBRoster = seasonData.rosters.find(
        (r: ExtendedRoster) => r.owner_id === managerBData.sleeper.id
      );

      if (!managerARoster || !managerBRoster) return;

      // Get playoff week start for this season
      const playoffWeekStart = getPlayoffWeekStart(seasonData);

      // Process regular season matchups

      if (seasonData.matchups) {
        Object.entries(seasonData.matchups).forEach(
          ([weekStr, weekMatchups]) => {
            const week = parseInt(weekStr);

            // Skip incomplete weeks
            if (!isWeekCompleted(week, seasonData.league)) {
              return;
            }

            // Skip playoff weeks for regular season matchups
            if (isPlayoffWeek(week, playoffWeekStart)) return;

            // Find matchups between the two managers (avoid duplicates)
            const processedMatchupIds = new Set<string>();

            weekMatchups.forEach((matchup: ExtendedMatchup) => {
              if (matchup.matchup_id === null) return;
              if (processedMatchupIds.has(matchup.matchup_id.toString()))
                return;

              const managerAMatchup =
                matchup.roster_id === managerARoster.roster_id
                  ? matchup
                  : weekMatchups.find(
                      (m: ExtendedMatchup) =>
                        m.matchup_id === matchup.matchup_id &&
                        m.roster_id === managerARoster.roster_id
                    );
              const managerBMatchup =
                matchup.roster_id === managerBRoster.roster_id
                  ? matchup
                  : weekMatchups.find(
                      (m: ExtendedMatchup) =>
                        m.matchup_id === matchup.matchup_id &&
                        m.roster_id === managerBRoster.roster_id
                    );

              if (!managerAMatchup || !managerBMatchup) return;

              // Mark this matchup as processed
              processedMatchupIds.add(matchup.matchup_id.toString());

              const h2hMatchup: H2HMatchup = {
                year,
                week,
                matchupId: matchup.matchup_id?.toString() || null,
                managerAPoints: managerAMatchup.points,
                managerBPoints: managerBMatchup.points,
                result:
                  managerAMatchup.points > managerBMatchup.points
                    ? "W"
                    : managerAMatchup.points < managerBMatchup.points
                    ? "L"
                    : "T",
                isPlayoff: false,
              };

              regularSeasonMatchups.push(h2hMatchup);

              // Track player scores for both managers (only in this specific matchup)
              [managerAMatchup, managerBMatchup].forEach(
                (matchup, managerIndex) => {
                  const currentPlayerScores =
                    managerIndex === 0
                      ? managerAPlayerScores
                      : managerBPlayerScores;

                  if (matchup.starters_points && matchup.starters) {
                    // Map starter positions to player IDs
                    matchup.starters.forEach((playerId, index) => {
                      // Skip empty starter slots (playerId is 0)
                      if (playerId === "0") {
                        return;
                      }

                      const points = matchup.starters_points?.[index];
                      const pointsNum = typeof points === "number" ? points : 0;
                      if (pointsNum > 0) {
                        // Check if this is a string-named player (like "Danario Alexander")
                        const isStringNamedPlayer =
                          typeof playerId === "string" &&
                          playerId.includes(" ");

                        const player = isStringNamedPlayer
                          ? null
                          : getPlayer(playerId.toString(), year);
                        const playerName = player
                          ? `${player.first_name} ${player.last_name}`
                          : playerId.toString(); // Use the ID as the name for string-named players

                        // Add this score to the player's array with context
                        if (!currentPlayerScores.has(playerName)) {
                          currentPlayerScores.set(playerName, []);
                        }
                        const result =
                          managerAMatchup.points > managerBMatchup.points
                            ? managerIndex === 0
                              ? "W"
                              : "L"
                            : managerAMatchup.points < managerBMatchup.points
                            ? managerIndex === 0
                              ? "L"
                              : "W"
                            : "T";

                        currentPlayerScores.get(playerName)!.push({
                          score: pointsNum,
                          year,
                          week,
                          result,
                          playerId: playerId.toString(),
                        });
                      }
                    });
                  }
                }
              );
            });
          }
        );
      }

      // Process playoff matchups (from matchup data, not bracket)

      if (seasonData.matchups) {
        Object.entries(seasonData.matchups).forEach(
          ([weekStr, weekMatchups]) => {
            const week = parseInt(weekStr);

            // Skip incomplete weeks
            if (!isWeekCompleted(week, seasonData.league)) {
              return;
            }

            // Only include playoff weeks
            if (isRegularSeasonWeek(week, playoffWeekStart)) return;

            // Find playoff matchups between the two managers (avoid duplicates)
            const processedPlayoffMatchupIds = new Set<string>();

            weekMatchups.forEach((matchup: ExtendedMatchup) => {
              if (matchup.matchup_id === null) return;
              if (processedPlayoffMatchupIds.has(matchup.matchup_id.toString()))
                return;

              const managerAMatchup =
                matchup.roster_id === managerARoster.roster_id
                  ? matchup
                  : weekMatchups.find(
                      (m: ExtendedMatchup) =>
                        m.matchup_id === matchup.matchup_id &&
                        m.roster_id === managerARoster.roster_id
                    );
              const managerBMatchup =
                matchup.roster_id === managerBRoster.roster_id
                  ? matchup
                  : weekMatchups.find(
                      (m: ExtendedMatchup) =>
                        m.matchup_id === matchup.matchup_id &&
                        m.roster_id === managerBRoster.roster_id
                    );

              if (!managerAMatchup || !managerBMatchup) return;

              // Check if this is a meaningful playoff game (elimination/championship only)
              // Must find a bracket match where these two specific teams are paired together
              // Exclude consolation games (3rd place, 5th place, etc.) which have 'p' property
              const meaningfulBracketMatch = seasonData.winners_bracket?.find(
                (bm: BracketMatch) => {
                  const teamAMatch =
                    bm.t1 === managerARoster.roster_id ||
                    bm.t2 === managerARoster.roster_id;
                  const teamBMatch =
                    bm.t1 === managerBRoster.roster_id ||
                    bm.t2 === managerBRoster.roster_id;
                  return teamAMatch && teamBMatch;
                }
              );

              // Only include if it's an elimination/championship game
              // Include championship (p.1) but exclude consolation games (p.3, p.5, etc.)
              const isMeaningfulPlayoff =
                meaningfulBracketMatch &&
                (!meaningfulBracketMatch.p || meaningfulBracketMatch.p === 1);

              // Debug logging for jay vs rich
              if (
                (managerAData?.id === "jay" && managerBData?.id === "rich") ||
                (managerAData?.id === "rich" && managerBData?.id === "jay")
              ) {
                console.log(`Debug jay vs rich ${year} W${week}:`, {
                  matchupId: matchup.matchup_id,
                  week,
                  meaningfulBracketMatch,
                  isMeaningfulPlayoff,
                  managerARosterId: managerARoster.roster_id,
                  managerBRosterId: managerBRoster.roster_id,
                  willInclude: isMeaningfulPlayoff,
                });
              }

              if (isMeaningfulPlayoff) {
                // Mark this matchup as processed
                processedPlayoffMatchupIds.add(matchup.matchup_id.toString());

                playoffMatchups.push({
                  year,
                  week,
                  matchupId: matchup.matchup_id?.toString() || null,
                  managerAPoints: managerAMatchup.points,
                  managerBPoints: managerBMatchup.points,
                  result:
                    managerAMatchup.points > managerBMatchup.points
                      ? "W"
                      : managerAMatchup.points < managerBMatchup.points
                      ? "L"
                      : "T",
                  isPlayoff: true,
                });

                // Track player scores for playoff matchups too
                [managerAMatchup, managerBMatchup].forEach(
                  (matchup, managerIndex) => {
                    const currentPlayerScores =
                      managerIndex === 0
                        ? managerAPlayerScores
                        : managerBPlayerScores;

                    if (matchup.starters_points && matchup.starters) {
                      // Map starter positions to player IDs
                      matchup.starters.forEach((playerId, playerIndex) => {
                        // Skip empty starter slots (playerId is 0)
                        if (playerId === "0") {
                          return;
                        }

                        const points = matchup.starters_points?.[playerIndex];
                        const pointsNum =
                          typeof points === "number" ? points : 0;
                        if (pointsNum > 0) {
                          // Check if this is a string-named player (like "Danario Alexander")
                          const isStringNamedPlayer =
                            typeof playerId === "string" &&
                            playerId.includes(" ");

                          const player = isStringNamedPlayer
                            ? null
                            : getPlayer(playerId.toString(), year);
                          const playerName = player
                            ? `${player.first_name} ${player.last_name}`
                            : playerId.toString(); // Use the ID as the name for string-named players

                          // Add this score to the player's array with context
                          if (!currentPlayerScores.has(playerName)) {
                            currentPlayerScores.set(playerName, []);
                          }
                          const result =
                            managerAMatchup.points > managerBMatchup.points
                              ? managerIndex === 0
                                ? "W"
                                : "L"
                              : managerAMatchup.points < managerBMatchup.points
                              ? managerIndex === 0
                                ? "L"
                                : "W"
                              : "T";

                          currentPlayerScores.get(playerName)!.push({
                            score: pointsNum,
                            year,
                            week,
                            result,
                            playerId: playerId.toString(),
                          });
                        }
                      });
                    }
                  }
                );
              }
            });
          }
        );
      }
    });

    // Calculate overall stats for both teams
    const managerAWins = regularSeasonMatchups.filter(
      (m) => m.result === "W"
    ).length;
    const managerBWins = regularSeasonMatchups.filter(
      (m) => m.result === "L"
    ).length;
    const ties = regularSeasonMatchups.filter((m) => m.result === "T").length;

    const managerATotalPoints = regularSeasonMatchups.reduce(
      (sum, m) => sum + m.managerAPoints,
      0
    );
    const managerBTotalPoints = regularSeasonMatchups.reduce(
      (sum, m) => sum + m.managerBPoints,
      0
    );

    const managerAAvgPoints =
      regularSeasonMatchups.length > 0
        ? managerATotalPoints / regularSeasonMatchups.length
        : 0;
    const managerBAvgPoints =
      regularSeasonMatchups.length > 0
        ? managerBTotalPoints / regularSeasonMatchups.length
        : 0;

    // Calculate current streak
    const sortedMatchups = [...regularSeasonMatchups].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.week - a.week;
    });

    let currentStreak = {
      type: "W" as "W" | "L" | "T",
      count: 0,
      manager: "A" as "A" | "B",
    };
    if (sortedMatchups.length > 0) {
      const mostRecentResult = sortedMatchups[0].result;
      let streakCount = 1;

      for (let i = 1; i < sortedMatchups.length; i++) {
        if (sortedMatchups[i].result === mostRecentResult) {
          streakCount++;
        } else {
          break;
        }
      }

      // Determine which manager the streak belongs to
      // The result is from Manager A's perspective, so:
      // - "W" streak belongs to Manager A
      // - "L" streak belongs to Manager A (Manager A is losing)
      // - "T" streak belongs to both (but we'll show Manager A)
      const streakManager = "A";
      currentStreak = {
        type: mostRecentResult,
        count: streakCount,
        manager: streakManager,
      };
    }

    // Process player scores into All-Stars format
    const managerAPerformances = Array.from(managerAPlayerScores.entries())
      .map(([playerName, scores]) => ({
        playerName,
        playerId: scores[0]?.playerId || playerName, // Use first score's playerId, fallback to playerName
        totalPoints: scores.reduce((sum, scoreObj) => sum + scoreObj.score, 0),
        gamesPlayed: scores.length,
        averagePoints:
          scores.reduce((sum, scoreObj) => sum + scoreObj.score, 0) /
          scores.length,
        bestScore: Math.max(...scores.map((s) => s.score)),
        allScores: scores,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    const managerBPerformances = Array.from(managerBPlayerScores.entries())
      .map(([playerName, scores]) => ({
        playerName,
        playerId: scores[0]?.playerId || playerName, // Use first score's playerId, fallback to playerName
        totalPoints: scores.reduce((sum, scoreObj) => sum + scoreObj.score, 0),
        gamesPlayed: scores.length,
        averagePoints:
          scores.reduce((sum, scoreObj) => sum + scoreObj.score, 0) /
          scores.length,
        bestScore: Math.max(...scores.map((s) => s.score)),
        allScores: scores,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    // Create valid lineups for All-Stars
    const createValidLineup = (performances: typeof managerAPerformances) => {
      const lineup: Array<{
        position: string;
        player: (typeof performances)[0] | null;
      }> = [
        { position: "QB", player: null },
        { position: "RB", player: null },
        { position: "RB", player: null },
        { position: "WR", player: null },
        { position: "WR", player: null },
        { position: "TE", player: null },
        { position: "FLEX", player: null },
        { position: "K", player: null },
        { position: "DEF", player: null },
      ];

      // Track which players we've already used
      const usedPlayers = new Set<string>();

      // Helper function to get player position
      const getPlayerPositionLocal = (playerName: string) => {
        return getPlayerPositionComprehensive(playerName);
      };

      // Fill each position with the best available player
      lineup.forEach((slot) => {
        const availablePlayers = performances.filter(
          (p) => !usedPlayers.has(p.playerName)
        );

        if (slot.position === "FLEX") {
          // FLEX can be RB, WR, or TE
          const flexPlayers = availablePlayers.filter((p) => {
            const pos = getPlayerPositionLocal(p.playerName);
            return pos === "RB" || pos === "WR" || pos === "TE";
          });
          if (flexPlayers.length > 0) {
            slot.player = flexPlayers[0];
            usedPlayers.add(slot.player.playerName);
          }
        } else {
          // Specific position
          const positionPlayers = availablePlayers.filter((p) => {
            const pos = getPlayerPositionLocal(p.playerName);
            return pos === slot.position;
          });
          if (positionPlayers.length > 0) {
            slot.player = positionPlayers[0];
            usedPlayers.add(slot.player.playerName);
          }
        }
      });

      return lineup;
    };

    const managerALineup = createValidLineup(managerAPerformances);
    const managerBLineup = createValidLineup(managerBPerformances);

    // Get best performances (top 10 individual game scores, deduplicated by player)
    const managerABestPerformances = managerAPerformances
      .flatMap((p) =>
        p.allScores.map((scoreObj) => ({
          playerName: p.playerName,
          playerId: p.playerId,
          score: scoreObj.score,
          year: scoreObj.year,
          week: scoreObj.week,
          result: scoreObj.result,
        }))
      )
      .sort((a, b) => b.score - a.score)
      .filter((performance, index, array) => {
        // Keep only the first occurrence of each player (highest score)
        return (
          array.findIndex((p) => p.playerId === performance.playerId) === index
        );
      })
      .slice(0, 5);

    const managerBBestPerformances = managerBPerformances
      .flatMap((p) =>
        p.allScores.map((scoreObj) => ({
          playerName: p.playerName,
          playerId: p.playerId,
          score: scoreObj.score,
          year: scoreObj.year,
          week: scoreObj.week,
          result: scoreObj.result,
        }))
      )
      .sort((a, b) => b.score - a.score)
      .filter((performance, index, array) => {
        // Keep only the first occurrence of each player (highest score)
        return (
          array.findIndex((p) => p.playerId === performance.playerId) === index
        );
      })
      .slice(0, 5);

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
  }, [managerA, managerB]);

  if (!h2hData) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Matchup Not Found
        </h1>
        <p className="text-gray-600">
          The requested head-to-head matchup could not be found.
        </p>
      </div>
    );
  }

  const {
    managerA: managerAData,
    managerB: managerBData,
    regularSeasonMatchups,
    playoffMatchups,
    managerALineup,
    managerBLineup,
    managerABestPerformances,
    managerBBestPerformances,
    stats,
  } = h2hData;

  type H2HLineupSlot = (typeof managerALineup)[number];
  type H2HBestPerformance = (typeof managerABestPerformances)[number];
  const lineupColumnHelper = createColumnHelper<H2HLineupSlot>();
  const performanceColumnHelper = createColumnHelper<H2HBestPerformance>();

  /** Who won, named. "W" is from manager A's point of view throughout. */
  const winnerPill = (result: H2HMatchup["result"]) => (
    <Pill
      className={
        result === "W"
          ? "bg-blue-100 text-blue-800"
          : result === "L"
          ? "bg-purple-100 text-purple-800"
          : "bg-gray-100 text-gray-800"
      }
    >
      {result === "W"
        ? managerAData?.teamName
        : result === "L"
        ? managerBData?.teamName
        : "Tie"}
    </Pill>
  );

  const yearColumn = matchupColumnHelper.accessor("year", {
    header: "Year",
    cell: (info) => info.getValue(),
    enableSorting: false,
    // A year reads as this row's label, not as a quantity to compare down the
    // column, so it keeps the left edge but takes tabular figures.
    meta: {
      kind: "numeric" as const,
      align: "left" as const,
      cellClassName: "font-medium",
    },
  });

  const scoreColumn = matchupColumnHelper.display({
    id: "score",
    header: "Score",
    cell: ({ row }) =>
      `${number(row.original.managerAPoints, {
        maximumFractionDigits: 2,
      })} - ${number(row.original.managerBPoints, {
        maximumFractionDigits: 2,
      })}`,
    meta: { kind: "record" as const, align: "left" as const },
  });

  const resultColumn = matchupColumnHelper.display({
    id: "result",
    header: "Result",
    cell: ({ row }) => winnerPill(row.original.result),
  });

  // These tables are a chronology, and the regular-season one is cut to the
  // last five unless expanded — a column sort would reorder that window rather
  // than the record, so sorting stays off on both.
  const regularSeasonColumns = [
    yearColumn,
    matchupColumnHelper.display({
      id: "week",
      header: "Week",
      cell: ({ row }) =>
        row.original.matchupId ? (
          <Link
            to={`/seasons/${row.original.year}/matchups/${row.original.week}/${row.original.matchupId}`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Week {row.original.week}
          </Link>
        ) : (
          `Week ${row.original.week}`
        ),
    }),
    scoreColumn,
    resultColumn,
  ];

  const playoffColumns = [
    yearColumn,
    matchupColumnHelper.display({
      id: "round",
      header: "Round",
      cell: ({ row }) => playoffRoundLabel(row.original.year, row.original.week),
    }),
    scoreColumn,
    resultColumn,
  ];

  // The rows ARE the lineup slots, in slot order; sorting them by points would
  // destroy the only thing the table says.
  const lineupColumns = [
    lineupColumnHelper.accessor("position", {
      header: "Pos",
      cell: (info) => info.getValue(),
      enableSorting: false,
      meta: { cellClassName: "pr-0", headerClassName: "pr-0" },
    }),
    lineupColumnHelper.display({
      id: "player",
      header: "Player",
      cell: ({ row }) => {
        const { position, player } = row.original;
        if (!player) return "—";

        return (
          <div className="flex items-center gap-2">
            <PlayerAvatar
              playerId={player.playerId}
              playerName={player.playerName}
              square={position === "DEF"}
            />
            {player.playerName}
          </div>
        );
      },
      meta: {
        kind: "player" as const,
        playerId: (row: H2HLineupSlot) => row.player?.playerId,
        cellClassName: "font-medium",
      },
    }),
    lineupColumnHelper.display({
      id: "games",
      header: "Games",
      cell: ({ row }) => row.original.player?.gamesPlayed ?? "—",
      meta: { kind: "numeric" as const },
    }),
    lineupColumnHelper.display({
      id: "points",
      header: "Points",
      cell: ({ row }) =>
        row.original.player
          ? number(row.original.player.totalPoints, {
              maximumFractionDigits: 2,
            })
          : "—",
      meta: { kind: "points" as const },
    }),
    lineupColumnHelper.display({
      id: "average",
      header: "Average",
      cell: ({ row }) =>
        row.original.player
          ? number(row.original.player.averagePoints, {
              maximumFractionDigits: 2,
            })
          : "—",
      meta: { kind: "points" as const },
    }),
  ];

  // Already the top five by score; sorting the five would misrepresent them.
  const bestPerformanceColumns = [
    performanceColumnHelper.accessor("playerName", {
      header: "Player",
      cell: (info) => (
        <div className="flex items-center gap-2">
          <PlayerAvatar
            playerId={info.row.original.playerId}
            playerName={info.getValue()}
          />
          {info.getValue()}
        </div>
      ),
      enableSorting: false,
      meta: {
        kind: "player" as const,
        playerId: (row: H2HBestPerformance) => row.playerId,
        cellClassName: "font-medium",
      },
    }),
    performanceColumnHelper.display({
      id: "yearWeek",
      header: "Year/Week",
      cell: ({ row }) => `${row.original.year} W${row.original.week}`,
    }),
    performanceColumnHelper.accessor("score", {
      header: "Points",
      cell: (info) => number(info.getValue(), { maximumFractionDigits: 2 }),
      enableSorting: false,
      meta: { kind: "points" as const },
    }),
    performanceColumnHelper.display({
      id: "result",
      header: "Result",
      cell: ({ row }) => (
        <Pill
          className={
            row.original.result === "W"
              ? "bg-green-100 text-green-800"
              : row.original.result === "L"
              ? "bg-red-100 text-red-800"
              : "bg-gray-100 text-gray-800"
          }
        >
          {row.original.result}
        </Pill>
      ),
    }),
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {managerAData?.teamName} vs {managerBData?.teamName}
          </h1>
          <p className="text-gray-600">
            Head-to-Head Record: {managerAData?.teamName} {stats.managerAWins}-
            {stats.managerBWins} {managerBData?.teamName}
            {stats.ties > 0 && ` (${stats.ties} ties)`}
          </p>
        </div>
      </div>

      {/* Overall Stats */}
      <Card padding="none" className="mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Overall Statistics
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-neutral-200 md:divide-x divide-y md:divide-y-0">
            {/* Manager A Stats */}
            <div className="text-center md:pb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                <Link
                  to={`/managers/${managerAData?.id}`}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {managerAData?.teamName}
                </Link>
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.managerAWins}
                  </div>
                  <div className="text-sm text-gray-600">Wins</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.managerBWins}
                  </div>
                  <div className="text-sm text-gray-600">Losses</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.ties}
                  </div>
                  <div className="text-sm text-gray-600">Ties</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {number(stats.managerAAvgPoints, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-sm text-gray-600">Avg Points</div>
                </div>
              </div>
            </div>

            {/* Manager B Stats */}
            <div className="text-center pt-4 md:pt-0 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                <Link
                  to={`/managers/${managerBData?.id}`}
                  className="text-purple-600 hover:text-purple-800 hover:underline"
                >
                  {managerBData?.teamName}
                </Link>
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.managerBWins}
                  </div>
                  <div className="text-sm text-gray-600">Wins</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.managerAWins}
                  </div>
                  <div className="text-sm text-gray-600">Losses</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.ties}
                  </div>
                  <div className="text-sm text-gray-600">Ties</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {number(stats.managerBAvgPoints, {
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-sm text-gray-600">Avg Points</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <div className="inline-flex items-center space-x-2">
              <span className="text-lg font-medium text-gray-900">
                Current Streak:
              </span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  stats.currentStreak.manager === "A"
                    ? "bg-blue-100 text-blue-800"
                    : stats.currentStreak.manager === "B"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {stats.currentStreak.manager === "A"
                  ? managerAData?.teamName
                  : managerBData?.teamName}{" "}
                {stats.currentStreak.type}
                {stats.currentStreak.count}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Regular Season Matchups */}
      <Card padding="none" className="mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Regular Season Matchups ({regularSeasonMatchups.length})
            </h2>
            {regularSeasonMatchups.length > 5 && (
              <button
                onClick={() => setShowAllRegularSeason(!showAllRegularSeason)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {showAllRegularSeason ? "Show Last 5" : "Show All"}
              </button>
            )}
          </div>
        </div>
        <DataTable
          columns={regularSeasonColumns}
          data={
            showAllRegularSeason
              ? regularSeasonMatchups
              : regularSeasonMatchups.slice(0, 5)
          }
          emptyMessage="These two have never met in the regular season."
        />
      </Card>

      {/* Playoff Matchups */}
      {playoffMatchups.length > 0 && (
        <Card padding="none" className="mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Playoff Matchups
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              These games are not included in the overall statistics above.
            </p>
          </div>
          <DataTable
            columns={playoffColumns}
            data={[...playoffMatchups].sort((a, b) =>
              // Newest season first; within a season, the earliest round first.
              a.year !== b.year ? b.year - a.year : a.week - b.week
            )}
          />
        </Card>
      )}

      {/* All-Star Lineups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {[
          {
            teamName: managerAData?.teamName,
            lineup: managerALineup,
            opponentName: managerBData?.teamName,
          },
          {
            teamName: managerBData?.teamName,
            lineup: managerBLineup,
            opponentName: managerAData?.teamName,
          },
        ].map(({ teamName, lineup, opponentName }) => (
          <Card key={teamName} padding="none">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {teamName} All-Stars
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Top performers against {opponentName}
              </p>
            </div>
            <DataTable columns={lineupColumns} data={lineup} />
          </Card>
        ))}
      </div>

      {/* Best Performances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {[
          {
            teamName: managerAData?.teamName,
            performances: managerABestPerformances,
            opponentName: managerBData?.teamName,
          },
          {
            teamName: managerBData?.teamName,
            performances: managerBBestPerformances,
            opponentName: managerAData?.teamName,
          },
        ].map(({ teamName, performances, opponentName }) => (
          <Card key={teamName} padding="none">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {teamName} Best Performances
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Top 5 individual game scores against {opponentName}
              </p>
            </div>
            <DataTable
              columns={bestPerformanceColumns}
              data={performances}
              emptyMessage="No games between these two yet."
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
