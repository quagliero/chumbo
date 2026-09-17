import { defineStat } from "./registry";
import type { Game, StatEntry } from "./types";

/**
 * Matchup records (C3a, C3b).
 *
 * These are the reference implementations for the registry — the shape the
 * remaining stats follow. Each one is a filter and a map over the flattened
 * game list; none of them walks the seasons itself.
 */

const matchupHref = (game: Game) =>
  `/seasons/${game.year}/matchups/${game.week}/${game.matchupId}`;

const versus = (game: Game) =>
  `${game.year} Week ${game.week} vs ${game.opponentManagerId ?? "unknown"}`;

const entry = (game: Game, value: number): StatEntry => ({
  value,
  subject: game.managerId ?? String(game.rosterId),
  href: matchupHref(game),
  detail: versus(game),
  year: game.year,
  week: game.week,
});

/**
 * Each game appears twice in the flattened list, once per team. For a stat
 * about the game rather than the team — a margin, a combined total — keep one
 * half, or every record shows up as a duplicate pair.
 */
const oneSidePerGame = (games: Game[]) =>
  games.filter((game) => game.rosterId < game.opponentRosterId);

export const biggestMargin = defineStat({
  id: "biggest-margin",
  label: "Biggest blowout",
  description: "The largest winning margin in league history.",
  scope: "league",
  format: "points",
  direction: "high",
  compute: ({ games }) =>
    games
      .filter((game) => game.result === "win")
      .map((game) => entry(game, Math.round(game.margin * 100) / 100)),
});

export const closestMargin = defineStat({
  id: "closest-margin",
  label: "Closest game",
  description:
    "The narrowest winning margin. Ties are excluded — they are their own thing.",
  scope: "league",
  format: "points",
  direction: "low",
  compute: ({ games }) =>
    oneSidePerGame(games)
      .filter((game) => game.result !== "tie")
      .map((game) =>
        entry(game, Math.round(Math.abs(game.margin) * 100) / 100)
      ),
});

export const highestScoringLoss = defineStat({
  id: "highest-scoring-loss",
  label: "Unluckiest loss",
  description:
    "The most points anyone has ever scored and still lost. Any other week it would have won.",
  scope: "league",
  format: "points",
  direction: "high",
  compute: ({ games }) =>
    games
      .filter((game) => game.result === "loss")
      .map((game) => entry(game, game.points)),
});

export const lowestScoringWin = defineStat({
  id: "lowest-scoring-win",
  label: "Luckiest win",
  description:
    "The fewest points anyone has ever scored and still won. The opposite of the unluckiest loss.",
  scope: "league",
  format: "points",
  direction: "low",
  compute: ({ games }) =>
    games
      .filter((game) => game.result === "win")
      .map((game) => entry(game, game.points)),
});
