import { getPlayer } from "@/data";
import { getStatContext } from "@/utils/stats/traverse";
import type { Game } from "@/utils/stats/types";

/**
 * The series in sentences, for a preview (K1): what the group chat used to be
 * told before a game by hand, from `scripts/generate-h2h-preview.mjs`'s
 * numbers. Each fact carries a weight — how unusual it is — so the week's
 * card can lead with the one or two worth saying, and the game's own page can
 * list them all.
 *
 * Regular season only, like the all-time record the card prints above them:
 * a fact that counted a final would disagree with the record beside it. Only
 * starters and final scores are read, so 2019 is in (its bench is the only
 * thing missing, `src/domain/dataQuality.ts`).
 */

export interface Tidbit {
  text: string;
  /** How much it deserves the card's one line. Above 1 is notable. */
  weight: number;
}

interface Named {
  managerId: string | null;
  ownerId: string;
  name: string;
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => COUNT_WORDS[n] ?? String(n);
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${count(n)} times`);

// The script's thresholds, so a line the site prints is one the chat got.
export const BLOWOUT_MARGIN = 30;
const NAILBITER_MARGIN = 5;
const WEEK_FORM_RATE = 0.75;
const WEEK_FORM_MIN_GAMES = 3;

const isSide = (side: Named) => (managerId: string | null, ownerId: string) =>
  side.managerId ? managerId === side.managerId : ownerId === side.ownerId;

const playerName = (playerId: string, year: number) => {
  const player = getPlayer(playerId, year);
  if (!player) return playerId;
  const joined = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  return player.full_name?.trim() || joined || playerId;
};

/** How many of the week's other scores each score beat, keyed by year-week. */
const fieldOf = (games: Game[]) => {
  const byWeek = new Map<string, number[]>();
  for (const game of games) {
    if (!game.isRegularSeason) continue;
    const key = `${game.year}-${game.week}`;
    byWeek.set(key, [...(byWeek.get(key) ?? []), game.points]);
  }
  return (game: Game) => {
    const others = byWeek.get(`${game.year}-${game.week}`) ?? [];
    const beaten = others.filter((p) => p < game.points).length;
    const lostTo = others.filter((p) => p > game.points).length;
    return { beaten, lostTo };
  };
};

export const seriesTidbits = (a: Named, b: Named, week: number): Tidbit[] => {
  const { games } = getStatContext();
  const isA = isSide(a);
  const isB = isSide(b);
  const regular = games.filter((g) => g.isRegularSeason);
  // Each meeting once, from A's side.
  const meetings = regular
    .filter((g) => isA(g.managerId, g.ownerId) && isB(g.opponentManagerId, g.opponentOwnerId))
    .sort((x, y) => x.year - y.year || x.week - y.week);
  const tidbits: Tidbit[] = [];
  const winnerOf = (g: Game) => (g.margin > 0 ? a : b);
  const scoreOf = (g: Game) => {
    const [high, low] = g.margin > 0 ? [g.points, g.opponentPoints] : [g.opponentPoints, g.points];
    return `${high.toFixed(1)}–${low.toFixed(1)}`;
  };

  if (meetings.length > 0) {
    const decided = meetings.filter((g) => g.result !== "tie");

    const biggest = [...decided].sort((x, y) => Math.abs(y.margin) - Math.abs(x.margin))[0];
    if (biggest && Math.abs(biggest.margin) >= BLOWOUT_MARGIN) {
      tidbits.push({
        text: `Biggest win of the series: ${winnerOf(biggest).name} by ${Math.abs(biggest.margin).toFixed(1)} in ${biggest.year}, ${scoreOf(biggest)}.`,
        weight: Math.abs(biggest.margin) / 50,
      });
    }

    const closest = [...decided].sort((x, y) => Math.abs(x.margin) - Math.abs(y.margin))[0];
    if (closest && decided.length > 1 && Math.abs(closest.margin) < 2) {
      tidbits.push({
        text: `Closest of the series: ${winnerOf(closest).name} by ${Math.abs(closest.margin).toFixed(2)} in ${closest.year}.`,
        weight: 1.4 - Math.abs(closest.margin) / 4,
      });
    }

    const blowouts = decided.filter((g) => Math.abs(g.margin) >= BLOWOUT_MARGIN).length;
    const nailbiters = decided.filter((g) => Math.abs(g.margin) < NAILBITER_MARGIN).length;
    if (meetings.length >= 5 && blowouts / meetings.length >= 0.4) {
      tidbits.push({
        text: `Rarely close: ${count(blowouts)} of their ${meetings.length} meetings were won by ${BLOWOUT_MARGIN} or more.`,
        weight: 0.8 + blowouts / meetings.length,
      });
    } else if (meetings.length >= 5 && nailbiters / meetings.length >= 0.3) {
      tidbits.push({
        text: `Usually tight: ${count(nailbiters)} of their ${meetings.length} meetings were decided by under ${NAILBITER_MARGIN}.`,
        weight: 0.8 + nailbiters / meetings.length,
      });
    }

    // The points ledger, and the better story when it contradicts the record.
    const pointsA = meetings.reduce((sum, g) => sum + g.points, 0);
    const pointsB = meetings.reduce((sum, g) => sum + g.opponentPoints, 0);
    const winsA = meetings.filter((g) => g.result === "win").length;
    const winsB = meetings.filter((g) => g.result === "loss").length;
    const diff = pointsA - pointsB;
    if (meetings.length >= 3 && Math.abs(diff) >= 1) {
      const [ahead, behind] = diff > 0 ? [a, b] : [b, a];
      const leaderOnRecord = winsA > winsB ? a : winsB > winsA ? b : null;
      if (leaderOnRecord && leaderOnRecord !== ahead) {
        tidbits.push({
          text: `${leaderOnRecord.name} leads the series, but ${ahead.name} has scored ${Math.abs(diff).toFixed(1)} more points in it.`,
          weight: 1.6,
        });
      } else {
        tidbits.push({
          text: `${ahead.name} has outscored ${behind.name} by ${Math.abs(diff).toFixed(1)} over ${meetings.length} meetings.`,
          weight: 0.3 + Math.abs(diff) / meetings.length / 40,
        });
      }
    }

    // Schedule luck: won with a score most of the league beat that week.
    const field = fieldOf(regular);
    for (const [side, won] of [
      [a, (g: Game) => g.result === "win" ? g.points : null],
      [b, (g: Game) => g.result === "loss" ? g.opponentPoints : null],
    ] as const) {
      const lucky = meetings.filter((g) => {
        const points = won(g);
        if (points === null) return false;
        const { beaten, lostTo } = field({ ...g, points });
        // Beaten by the rest of the field, not counting the opponent it beat.
        return lostTo > beaten - 1;
      }).length;
      // Two in a long series is ordinary; three starts to be a pattern.
      if (lucky >= 3) {
        const other = side === a ? b : a;
        tidbits.push({
          text: `${side.name} has beaten ${other.name} ${times(lucky)} with a score most of the league beat that week.`,
          weight: 0.6 + lucky / 5,
        });
      }
    }

    // The best single starter's game in the series.
    let best: { points: number; playerId: string; game: Game; side: Named } | null = null;
    for (const game of meetings) {
      for (const [side, raw] of [
        [a, game.raw],
        [b, regular.find(
          (g) => g.year === game.year && g.week === game.week && g.rosterId === game.opponentRosterId
        )?.raw],
      ] as const) {
        raw?.starters?.forEach((playerId, i) => {
          const points = raw.starters_points?.[i] ?? 0;
          if (playerId && playerId !== "0" && (!best || points > best.points)) {
            best = { points, playerId, game, side };
          }
        });
      }
    }
    const top = best as { points: number; playerId: string; game: Game; side: Named } | null;
    if (top && top.points >= 30) {
      tidbits.push({
        text: `Best game in the series: ${playerName(top.playerId, top.game.year)}'s ${top.points.toFixed(1)} for ${top.side.name} in ${top.game.year}.`,
        weight: 0.5 + (top.points - 30) / 20,
      });
    }
  }

  // Each manager in this week number, whoever they played.
  for (const side of [a, b]) {
    const inWeek = regular.filter((g) => g.week === week && isSide(side)(g.managerId, g.ownerId));
    if (inWeek.length < WEEK_FORM_MIN_GAMES) continue;
    const wins = inWeek.filter((g) => g.result === "win").length;
    const rate = wins / inWeek.length;
    if (rate >= WEEK_FORM_RATE) {
      tidbits.push({
        text: `${side.name} has won ${wins} of ${inWeek.length} games in week ${week}.`,
        weight: 0.6 + rate,
      });
    } else if (rate <= 1 - WEEK_FORM_RATE) {
      tidbits.push({
        text: `${side.name} has won ${count(wins)} of ${inWeek.length} games in week ${week}.`,
        weight: 0.6 + (1 - rate),
      });
    }
  }

  return tidbits.sort((x, y) => y.weight - x.weight);
};
