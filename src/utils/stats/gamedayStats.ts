import { getPlayer } from "@/data";
import { clockOf, minutesIntoWeek, slotOf, whenSlot } from "@/utils/gameFlow";
import { defineStat } from "./registry";
import type { FlowGame, Game, StatEntry } from "./types";

/**
 * Records only the play-by-play can see (L2).
 *
 * Every other stat in the registry is a question about final scores. These
 * three are questions about the week as it happened — what the league could
 * feel on a Sunday night but had never been able to look up: who came back
 * from furthest behind, who keeps winning in the last hours of the week, and
 * the latest a game has ever been decided.
 *
 * They read `flows` (see `./traverse`), so they declare `requiresTimelines`
 * and the registry refuses to answer them with an empty list when the week
 * files have not been provided. They also declare `requiresLineups`: a
 * timeline is built from who started, so 2019's reconstructed lineups would be
 * guessing at the shape of the game, not just at a total.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

const matchupHref = (game: Game) =>
  `/seasons/${game.year}/matchups/${game.week}/${game.matchupId}`;

const name = (managerId: string | null) => managerId ?? "unknown";

/** "2018 Week 6 vs dix". */
const versus = (game: Game) =>
  `${game.year} Week ${game.week} vs ${name(game.opponentManagerId)}`;

/** Defences carry no `full_name`; ids from the NFL.com years are names already. */
const playerName = (playerId: string, year: number): string => {
  if (!playerId) return "";
  const player = getPlayer(playerId, year);
  if (!player) return playerId;
  const joined = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  return player.full_name?.trim() || joined || playerId;
};

const entry = (
  { game }: FlowGame,
  value: number,
  detail: string
): StatEntry => ({
  value,
  subject: game.managerId ?? String(game.rosterId),
  href: matchupHref(game),
  detail,
  year: game.year,
  week: game.week,
});

/**
 * A moment that decided a game through a play, rather than through a
 * correction. Sixteen NFL.com-era weeks end on an adjustment that squares a
 * team with its official score, and one of those can technically be the
 * moment a lead changed hands — but it is not a play, it has no player and
 * its time is the time of the last real play, so it cannot hold a record
 * about WHEN a game was won.
 */
const decidedByPlay = ({ flow }: FlowGame) =>
  flow.decided && !flow.decided.correction ? flow.decided : null;

export const biggestComeback = defineStat({
  id: "biggest-comeback",
  label: "Biggest comeback",
  description:
    "The largest deficit a team has faced at any point in the week and still won. Part heroics and part scheduling — a team whose players all play on Monday night spends Sunday a long way behind — which is exactly what makes it worth watching.",
  scope: "league",
  format: "points",
  direction: "high",
  requiresLineups: true,
  requiresTimelines: true,
  compute: ({ flows }) =>
    flows
      .filter(({ flow }) => flow.comeback >= 0.01)
      .map((entryFlow) => {
        const { flow } = entryFlow;
        const low = flow.comebackFrom;
        const detail = low
          ? `${versus(entryFlow.game)}, ${flow.comeback.toFixed(1)} down ${whenSlot(
              slotOf(low.at)
            )}`
          : versus(entryFlow.game);
        return entry(entryFlow, round2(flow.comeback), detail);
      }),
});

export const latestDecisivePlay = defineStat({
  id: "latest-decisive-play",
  label: "Latest decisive play",
  description:
    "The latest in the week a game has ever been won — the moment the winner took the lead for the last time, with nothing left after it to take it back.",
  scope: "league",
  format: "count",
  direction: "high",
  requiresLineups: true,
  requiresTimelines: true,
  compute: ({ flows }) =>
    flows.flatMap((flowGame) => {
      const decided = decidedByPlay(flowGame);
      if (!decided) return [];
      const who = playerName(decided.starterId, flowGame.game.year);
      const detail = `${versus(flowGame.game)} · ${clockOf(decided.at)}${
        who ? `, ${who}` : ""
      }`;
      return [entry(flowGame, minutesIntoWeek(decided.at), detail)];
    }),
});

export const mondayNightWins = defineStat({
  id: "monday-night-wins",
  label: "Won it on Monday night",
  description:
    "Games a manager was losing until Monday night — the winner took the lead for good in the last game of the week. Nobody's idea of a relaxing evening.",
  scope: "manager",
  format: "count",
  direction: "high",
  requiresLineups: true,
  requiresTimelines: true,
  compute: ({ flows }) => {
    const byManager = new Map<string, FlowGame[]>();
    for (const flowGame of flows) {
      const decided = decidedByPlay(flowGame);
      if (!decided || slotOf(decided.at) !== "Monday night") continue;
      const managerId = flowGame.game.managerId;
      if (!managerId) continue;
      const won = byManager.get(managerId);
      if (won) won.push(flowGame);
      else byManager.set(managerId, [flowGame]);
    }

    return [...byManager].map(([managerId, won]) => {
      const latest = [...won].sort(
        (a, b) => a.game.year - b.game.year || a.game.week - b.game.week
      )[won.length - 1];
      return {
        value: won.length,
        subject: managerId,
        // To the game the detail names, not to the manager: the records page
        // makes the detail the link, and a sentence about one Monday night
        // that opens a career page is a link that lied.
        href: matchupHref(latest.game),
        // No year or week on purpose: this is a career count, and an entry
        // carrying a week would hang "the most Monday-night wins in Chumbo
        // history" under one particular game, as though that game were it.
        detail: `Most recently ${versus(latest.game)}`,
      };
    });
  },
});
