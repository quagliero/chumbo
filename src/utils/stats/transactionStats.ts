import {
  areTransactionsLoaded,
  getPlayer,
  loadTransactions,
  seasons,
} from "@/data";
import type { Transaction } from "@/types/transaction";
import { defineStat } from "./registry";
import type { Game, StatContext, StatEntry } from "./types";

/**
 * Waivers and trades — 6 MB of data almost nothing reads (C5).
 *
 * Unlike the other stat modules, these cannot be written as a filter over
 * `context.games` alone: the question is about the *transactions*, and the
 * games only supply the scoreboard. So each stat here does two things —
 * it walks `seasons[year].transactions`, and it scores what it finds against
 * a small index built once from `context.games`.
 *
 * Three things about the underlying data shape everything below.
 *
 * 1. **Transactions load lazily (A2a).** `seasons[year].transactions` is an
 *    empty object until `loadTransactions` has resolved. A stat that reads it
 *    too early does not fail — it silently returns zeroes, which is the worst
 *    possible outcome for a trade ledger people are going to quote at each
 *    other. So `compute` suspends instead, exactly as `useTransactionsLoaded`
 *    does: it throws the in-flight promise for the `<Suspense>` boundary that
 *    already wraps every route in `App.tsx`. The test suite's `setup.ts`
 *    awaits `loadAllSeasons()`, so nothing is ever thrown there.
 *
 * 2. **Only 2020 onwards has a complete transaction log.** 2012-2019 were
 *    played on NFL.com and re-entered by hand when the league moved to
 *    Sleeper; only the trades survived. There are 241 trades across those
 *    eight seasons and not one single waiver claim or free-agent pickup. Any
 *    stat that counts adds and drops therefore starts at 2020, and says so in
 *    its description — "nobody worked the wire in 2016" is a gap in the
 *    record, not a finding.
 *
 * 3. **Matchup rosters are frozen per week.** `players_points` for week 6 is
 *    the roster as it stood for week 6's games and is never rewritten, so
 *    "which weeks was this player on this roster" can be read straight off the
 *    scoreboard. That is what makes retrospective scoring honest here rather
 *    than a guess: a player picked up on the Tuesday after week 6 simply does
 *    not appear in week 6, so counting from the transaction's week onwards
 *    cannot credit anyone with points scored before they owned the player.
 */

/* ------------------------------------------------------------------ *
 * The index
 * ------------------------------------------------------------------ */

interface SeasonIndex {
  /** week -> player id -> that player's score in that week. */
  points: Map<number, Map<string, number>>;
  /** week -> player id -> the roster that held him for that week's games. */
  holder: Map<number, Map<string, number>>;
  /** week -> the player ids somebody actually started. */
  started: Map<number, Set<string>>;
  /** roster id -> internal manager id, for this season. */
  managerByRoster: Map<number, string>;
  weeks: number[];
}

const indexSeasons = (games: Game[]): Map<number, SeasonIndex> => {
  const byYear = new Map<number, SeasonIndex>();

  // `context.games` decides which seasons are in scope — the registry has
  // already dropped the ones a `requiresLineups` stat may not see — and it is
  // also where the roster -> manager mapping comes from.
  for (const game of games) {
    let season = byYear.get(game.year);
    if (!season) {
      season = {
        points: new Map(),
        holder: new Map(),
        started: new Map(),
        managerByRoster: new Map(),
        weeks: [],
      };
      byYear.set(game.year, season);
    }
    if (game.managerId) {
      season.managerByRoster.set(game.rosterId, game.managerId);
    }
  }

  // The scoreboard itself is read from the raw matchups rather than from
  // `games`, because `games` only keeps team-weeks that were part of a paired
  // matchup. Four teams a year sit out weeks 15 and 17 once the brackets are
  // set, and their lineups still scored: in 2021 that was Deebo Samuel's last
  // 14 points. Taking those from `games` would quietly shorten a traded
  // player's season depending on whether his owner made the playoffs.
  for (const [year, season] of byYear) {
    const byWeek = seasons[year]?.matchups ?? {};

    for (const [weekKey, weekMatchups] of Object.entries(byWeek)) {
      const week = Number(weekKey);
      if (!Number.isFinite(week) || !weekMatchups?.length) continue;

      const points = new Map<string, number>();
      const holder = new Map<string, number>();
      const started = new Set<string>();

      for (const matchup of weekMatchups) {
        for (const [playerId, score] of Object.entries(
          matchup.players_points ?? {}
        )) {
          points.set(playerId, score);
          holder.set(playerId, matchup.roster_id);
        }
        // Pre-2016 stores some starter ids as numbers; normalise as traverse does.
        for (const starter of matchup.starters ?? []) started.add(String(starter));
      }

      season.points.set(week, points);
      season.holder.set(week, holder);
      season.started.set(week, started);
      season.weeks.push(week);
    }

    season.weeks.sort((a, b) => a - b);
  }

  return byYear;
};

/**
 * The player's total score from `fromWeek` to the end of the season, whoever
 * was holding him.
 *
 * A week in which nobody rostered him is worth nothing, because the scoreboard
 * only records players on a roster. That is the one place this undercounts: a
 * traded player both managers then dropped stops accruing. He is on waivers
 * because he is not scoring, so the error runs towards zero rather than
 * towards a wrong winner.
 */
const pointsFrom = (season: SeasonIndex, fromWeek: number, playerId: string) => {
  let total = 0;
  for (const week of season.weeks) {
    if (week < fromWeek) continue;
    total += season.points.get(week)?.get(playerId) ?? 0;
  }
  return total;
};

/** What a roster got out of a player: his score in the weeks it held him. */
const pointsForRoster = (
  season: SeasonIndex,
  fromWeek: number,
  playerId: string,
  rosterId: number
) => {
  let rostered = 0;
  let started = 0;
  let starts = 0;

  for (const week of season.weeks) {
    if (week < fromWeek) continue;
    if (season.holder.get(week)?.get(playerId) !== rosterId) continue;

    const points = season.points.get(week)?.get(playerId) ?? 0;
    rostered += points;
    if (season.started.get(week)?.has(playerId)) {
      started += points;
      starts += 1;
    }
  }

  return { rostered, started, starts };
};

/* ------------------------------------------------------------------ *
 * Reading the transactions
 * ------------------------------------------------------------------ */

/** One transaction, with the week the loader filed it under. */
interface DatedTransaction {
  year: number;
  /** Sleeper's `leg` — the league week the move was processed in. */
  week: number;
  transaction: Transaction;
}

/**
 * Every completed transaction for the seasons we have a scoreboard for.
 *
 * Suspends if the transaction chunks have not been fetched yet — see the note
 * at the top of the file. Seasons absent from `years` (2019, for the stats
 * that declare `requiresLineups`) are skipped entirely rather than reported as
 * seasons in which nobody did anything.
 */
const completedTransactions = (years: number[]): DatedTransaction[] => {
  if (!areTransactionsLoaded(years)) throw loadTransactions(years);

  const all: DatedTransaction[] = [];

  for (const year of years) {
    const byWeek = seasons[year]?.transactions;
    if (!byWeek) continue;

    for (const [weekKey, weekTransactions] of Object.entries(byWeek)) {
      const week = Number(weekKey);
      if (!Number.isFinite(week) || !weekTransactions) continue;

      for (const transaction of weekTransactions) {
        if (transaction.status !== "complete") continue;
        all.push({ year, week, transaction });
      }
    }
  }

  return all;
};

/** The first season with a complete add/drop log. See note 2 at the top. */
const FIRST_WAIVER_SEASON = 2020;

const round = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const playerName = (playerId: string, year: number) =>
  // Team defences are stored as their abbreviation ("DAL") and have no entry
  // in the player dictionary; the id is already the readable form.
  getPlayer(playerId, year)?.full_name ?? playerId;

const named = (
  assets: Array<{ playerId: string; points: number }>,
  year: number
) =>
  assets
    .slice()
    .sort((a, b) => b.points - a.points)
    .map((a) => `${playerName(a.playerId, year)} (${round(a.points).toFixed(1)})`)
    .join(" + ");

/* ------------------------------------------------------------------ *
 * C5b — the trade ledger
 * ------------------------------------------------------------------ */

interface TradeSide {
  rosterId: number;
  managerId: string;
  received: Array<{ playerId: string; points: number }>;
  given: Array<{ playerId: string; points: number }>;
  net: number;
}

interface ScoredTrade {
  transactionId: string;
  year: number;
  /** The week the trade took effect — see `effectiveWeek`. */
  week: number;
  sides: TradeSide[];
}

/**
 * The week a trade actually took effect.
 *
 * Sleeper's `leg` does not advance until the Wednesday waiver run, so a trade
 * agreed on the Monday night after week 6's games is still filed under week 6.
 * Scoring from `leg` would then credit the receiving manager with points his
 * new player scored while the *other* manager still owned him.
 *
 * The rosters know better: the earliest week at or after `leg` in which a
 * traded player shows up on his new roster is the week the trade took effect.
 * One week is chosen for the whole trade so that both sides are scored over
 * exactly the same window — a ledger whose halves used different windows would
 * not balance, and a trade ledger that does not balance is worthless.
 */
const effectiveWeek = (
  season: SeasonIndex,
  leg: number,
  moves: Array<{ playerId: string; to: number }>
) => {
  let earliest = Infinity;

  for (const move of moves) {
    for (const week of season.weeks) {
      if (week < leg) continue;
      if (season.holder.get(week)?.get(move.playerId) === move.to) {
        if (week < earliest) earliest = week;
        break;
      }
    }
  }

  return Number.isFinite(earliest) ? earliest : leg;
};

interface TradeMove {
  playerId: string;
  from: number;
  to: number;
}

/** `player:from>to` for each player who changed hands, order-independent. */
const moveSignature = (moves: TradeMove[]) =>
  moves
    .map((move) => `${move.playerId}:${move.from}>${move.to}`)
    .sort()
    .join("|");

const inverseSignature = (moves: TradeMove[]) =>
  moves
    .map((move) => `${move.playerId}:${move.to}>${move.from}`)
    .sort()
    .join("|");

const scoreTrades = (context: StatContext): ScoredTrade[] => {
  const index = indexSeasons(context.games);
  const years = [...index.keys()].sort((a, b) => a - b);

  interface Candidate {
    year: number;
    week: number;
    transaction: Transaction;
    moves: TradeMove[];
  }

  const candidates: Candidate[] = [];

  for (const { year, week, transaction } of completedTransactions(years)) {
    if (transaction.type !== "trade") continue;

    // Trades that also move draft picks or FAAB are left out entirely rather
    // than scored on their players alone. There is no honest way to put a
    // points value on a 2027 third-rounder, and a ledger that quietly treats
    // one as worth nothing would say a manager who sold a star for picks was
    // fleeced. 147 of the 534 trades in scope are excluded on this rule.
    if (transaction.draft_picks.length > 0) continue;
    if (transaction.waiver_budget.length > 0) continue;

    // A trade's `adds`/`drops` also carry players a manager cut to make room.
    // Only a player who is added by one roster and dropped by a *different*
    // one actually changed hands.
    const moves: TradeMove[] = [];
    for (const [playerId, to] of Object.entries(transaction.adds ?? {})) {
      const from = transaction.drops?.[playerId];
      if (from !== undefined && from !== to) moves.push({ playerId, from, to });
    }
    if (!moves.length) continue;

    candidates.push({ year, week, transaction, moves });
  }

  /*
   * Drop a trade that was entered and then undone in the same week.
   *
   * There are three such pairs. NFL.com trades 232 and 233 in 2018 are the
   * same two players swapped in one direction and then back ten minutes later
   * — an entry correction during the migration, not two trades. Scored naively
   * it put James Conner's whole season (+215.6) on *both* managers' ledgers,
   * each apparently having won it. A genuine trade-back is a different thing
   * and is kept: the 2024 pair a week apart really was traded and traded back,
   * and there were games in between. Requiring the reversal to land in the
   * same league week is what separates the two.
   */
  const signatures = new Set(
    candidates.map((c) => `${c.year}|${c.week}|${moveSignature(c.moves)}`)
  );
  const undoneSameWeek = (c: Candidate) => {
    const forward = moveSignature(c.moves);
    const back = inverseSignature(c.moves);
    return back !== forward && signatures.has(`${c.year}|${c.week}|${back}`);
  };

  const scored: ScoredTrade[] = [];

  for (const candidate of candidates) {
    if (undoneSameWeek(candidate)) continue;
    const { year, week, transaction, moves } = candidate;

    const season = index.get(year);
    if (!season) continue;

    const sides = new Map<number, TradeSide>();
    for (const rosterId of transaction.roster_ids) {
      const managerId = season.managerByRoster.get(rosterId);
      if (!managerId) continue;
      sides.set(rosterId, {
        rosterId,
        managerId,
        received: [],
        given: [],
        net: 0,
      });
    }
    if (sides.size !== transaction.roster_ids.length) continue;

    const from = effectiveWeek(season, week, moves);

    for (const move of moves) {
      const receiver = sides.get(move.to);
      const giver = sides.get(move.from);
      if (!receiver || !giver) continue;

      // The player's own production from the trade onwards, wherever he was
      // rostered. This scores the *asset*, not the manager's subsequent lineup
      // decisions: if the winner benched his new star that is a different
      // argument, and it should not change who won the trade.
      const points = pointsFrom(season, from, move.playerId);

      receiver.received.push({ playerId: move.playerId, points });
      receiver.net += points;
      giver.given.push({ playerId: move.playerId, points });
      giver.net -= points;
    }

    scored.push({
      transactionId: transaction.transaction_id,
      year,
      week: from,
      sides: [...sides.values()].map((side) => ({
        ...side,
        net: round(side.net, 2),
      })),
    });
  }

  return scored;
};

/* ------------------------------------------------------------------ *
 * One player's trades (I3)
 * ------------------------------------------------------------------ */

/** A trade that moved one particular player, told from the giving side. */
export interface PlayerTrade {
  year: number;
  /** The week it took effect — the ledger's `effectiveWeek`, not `leg`. */
  week: number;
  /** Manager who gave the player up. */
  from: string;
  /** Manager who received him. */
  to: string;
  /** What `from` got back, with each player's points from `week` on. */
  received: Array<{ playerId: string; name: string; points: number }>;
  /** Draft picks `from` got back, as "2021 round 3". */
  picks: string[];
  /** FAAB `from` got back. */
  faab: number;
  /**
   * `from`'s net on the whole deal, straight off the trade ledger. Absent
   * where the ledger declines to settle it: a deal with picks or FAAB in it,
   * or one entered and undone in the same week.
   */
  net?: number;
}

/**
 * Every trade that moved `playerId` in `year`, in the order they happened.
 *
 * For the draft scatter's popover: a pick whose points all went elsewhere
 * needs to say where, and whether the drafter came out ahead. This is the
 * ledger's own reading of the transactions, narrowed to one player, so the
 * popover and the trade ledger cannot disagree about the same deal.
 *
 * Scoped to one season on purpose. The ledger reads every transaction it can
 * see, and would suspend until all fifteen seasons' worth had downloaded;
 * narrowing the games to `year` narrows the transactions it waits for to one
 * file. Suspends like the rest of this module if that file is not loaded yet.
 */
export const playerTrades = (
  context: StatContext,
  year: number,
  playerId: string
): PlayerTrade[] => {
  const scoped: StatContext = {
    ...context,
    games: context.games.filter((game) => game.year === year),
  };
  const season = indexSeasons(scoped.games).get(year);
  if (!season) return [];

  const settled = new Map(
    scoreTrades(scoped).map((trade) => [trade.transactionId, trade])
  );

  const trades: PlayerTrade[] = [];

  for (const { week: leg, transaction } of completedTransactions([year])) {
    if (transaction.type !== "trade") continue;

    const moves: TradeMove[] = [];
    for (const [id, to] of Object.entries(transaction.adds ?? {})) {
      const from = transaction.drops?.[id];
      if (from !== undefined && from !== to) moves.push({ playerId: id, from, to });
    }
    const mine = moves.find((move) => move.playerId === playerId);
    if (!mine) continue;

    const from = season.managerByRoster.get(mine.from);
    const to = season.managerByRoster.get(mine.to);
    if (!from || !to) continue;

    const ledger = settled.get(transaction.transaction_id);
    const picks = transaction.draft_picks.filter(
      (pick) => pick.owner_id === mine.from
    );
    const faab = transaction.waiver_budget
      .filter((budget) => budget.receiver === mine.from)
      .reduce((sum, budget) => sum + budget.amount, 0);
    // The ledger settles every player-for-player deal. One it did not settle
    // and that has no picks or FAAB in it was entered and undone in the same
    // week — a data-entry correction, like 2018's James Conner pair — and is
    // not a trade anybody made.
    if (!ledger && !transaction.draft_picks.length && !transaction.waiver_budget.length) {
      continue;
    }
    const week = ledger?.week ?? effectiveWeek(season, leg, moves);

    trades.push({
      year,
      week,
      from,
      to,
      received: moves
        .filter((move) => move.to === mine.from)
        .map((move) => ({
          playerId: move.playerId,
          name: playerName(move.playerId, year),
          points: round(pointsFrom(season, week, move.playerId)),
        }))
        .sort((a, b) => b.points - a.points),
      picks: picks.map((pick) => `${pick.season} round ${pick.round}`),
      faab,
      net: ledger?.sides.find((side) => side.rosterId === mine.from)?.net,
    });
  }

  return trades.sort((a, b) => a.week - b.week);
};

export const tradeLedger = defineStat({
  id: "trade-ledger",
  label: "Trade ledger",
  description:
    "Every trade, settled. Each side is worth the points its players went on " +
    "to score from the week the trade took effect to the end of that season, " +
    "so the two halves always cancel out: one manager's +200 is the other's " +
    "-200. It scores the players, not the lineups — benching what you just " +
    "traded for is a separate argument. Trades involving draft picks or FAAB " +
    "are left out, because there is no honest points value for a future pick.",
  scope: "league",
  format: "points",
  direction: "high",
  requiresLineups: true,
  compute: (context) =>
    scoreTrades(context).flatMap((trade) =>
      trade.sides.map((side): StatEntry => {
        const others = trade.sides
          .filter((other) => other !== side)
          .map((other) => other.managerId)
          .join(" / ");

        const got = side.received.length
          ? named(side.received, trade.year)
          : "nothing";
        const gave = side.given.length
          ? named(side.given, trade.year)
          : "nothing";

        return {
          value: side.net,
          subject: side.managerId,
          href: `/seasons/${trade.year}/trades`,
          detail: `${trade.year} Week ${trade.week}: got ${got}; gave ${gave} to ${others}`,
          year: trade.year,
          week: trade.week,
        };
      })
    ),
});

/* ------------------------------------------------------------------ *
 * C5a — the waiver wire
 * ------------------------------------------------------------------ */

interface WaiverRecord {
  pickups: number;
  started: number;
  rostered: number;
  best: { playerId: string; year: number; started: number } | null;
}

const scoreWaivers = (context: StatContext) => {
  const index = indexSeasons(context.games);
  const years = [...index.keys()]
    .filter((year) => year >= FIRST_WAIVER_SEASON)
    .sort((a, b) => a - b);

  // A manager can add, drop and re-add the same player inside one season —
  // thd picked Brock Purdy up twice in week 3 of 2024 alone. Counting each add
  // separately would credit those weeks two and three times over, so only the
  // first acquisition of a player by a roster in a season counts, and it is
  // scored over every week that roster held him afterwards.
  const firstPickup = new Map<
    string,
    { year: number; week: number; rosterId: number; playerId: string }
  >();

  for (const { year, week, transaction } of completedTransactions(years)) {
    if (transaction.type !== "waiver" && transaction.type !== "free_agent") {
      continue;
    }

    for (const [playerId, rosterId] of Object.entries(transaction.adds ?? {})) {
      const key = `${year}|${rosterId}|${playerId}`;
      const existing = firstPickup.get(key);
      if (!existing || week < existing.week) {
        firstPickup.set(key, { year, week, rosterId, playerId });
      }
    }
  }

  const byManager = new Map<string, WaiverRecord>();

  for (const { year, week, rosterId, playerId } of firstPickup.values()) {
    const season = index.get(year);
    const managerId = season?.managerByRoster.get(rosterId);
    if (!season || !managerId) continue;

    const { started, rostered } = pointsForRoster(
      season,
      week,
      playerId,
      rosterId
    );

    let record = byManager.get(managerId);
    if (!record) {
      record = { pickups: 0, started: 0, rostered: 0, best: null };
      byManager.set(managerId, record);
    }

    record.pickups += 1;
    record.started += started;
    record.rostered += rostered;
    if (!record.best || started > record.best.started) {
      record.best = { playerId, year, started };
    }
  }

  return byManager;
};

export const waiverHitRate = defineStat({
  id: "waiver-hit-rate",
  label: "Waiver wire hit rate",
  description:
    "Points started per pickup: everything a manager has claimed off waivers " +
    "or free agency, scored on what it actually put in his starting lineup " +
    "afterwards. Volume is not the same as value — the league's busiest wire " +
    "worker is also its least productive per move. Covers 2020 onwards, seven " +
    "of the fifteen seasons: 2012-2019 were re-entered by hand when the league " +
    "left NFL.com and only the trades survived, so there is no add/drop record " +
    "at all for those years. That is why this is a rate and not a total — a " +
    "career count would just reward whoever arrived after the gap.",
  scope: "manager",
  format: "points",
  direction: "high",
  requiresLineups: true,
  compute: (context) =>
    [...scoreWaivers(context)].map(([managerId, record]): StatEntry => {
      const best = record.best
        ? `; best ${playerName(record.best.playerId, record.best.year)} ` +
          `(${round(record.best.started).toFixed(1)} started, ${record.best.year})`
        : "";

      return {
        value: round(record.started / record.pickups, 2),
        subject: managerId,
        href: `/managers/${managerId}`,
        detail:
          `${record.pickups} pickups, ` +
          `${round(record.started).toFixed(1)} points started ` +
          `(${round(record.rostered).toFixed(1)} rostered)${best}`,
      };
    }),
});

/* ------------------------------------------------------------------ *
 * C5c — roster churn
 * ------------------------------------------------------------------ */

interface ChurnRecord {
  moves: number;
  adds: number;
  drops: number;
  trades: number;
}

export const rosterChurn = defineStat({
  id: "roster-churn",
  label: "Most churned roster",
  description:
    "Completed moves by one manager in one season — every add, every drop, " +
    "every trade he was part of. Commissioner corrections do not count. Only " +
    "2020 onwards appears, and deliberately so: churn is mostly waiver and " +
    "free-agent activity, and the hand-entered 2012-2019 seasons kept their " +
    "trades and nothing else. Listing those years would show eight quiet " +
    "seasons where really there is no record.",
  scope: "season",
  format: "count",
  direction: "high",
  compute: (context) => {
    const index = indexSeasons(context.games);
    const years = [...index.keys()]
      .filter((year) => year >= FIRST_WAIVER_SEASON)
      .sort((a, b) => a - b);

    const byManagerSeason = new Map<string, ChurnRecord>();

    for (const { year, transaction } of completedTransactions(years)) {
      if (transaction.type === "commissioner") continue;

      const season = index.get(year);
      if (!season) continue;

      // A trade is one move for each manager in it, so count rosters, not
      // transactions — and de-duplicate, because a roster can appear more than
      // once in `roster_ids`.
      for (const rosterId of new Set(transaction.roster_ids)) {
        const managerId = season.managerByRoster.get(rosterId);
        if (!managerId) continue;

        const key = `${managerId}|${year}`;
        let record = byManagerSeason.get(key);
        if (!record) {
          record = { moves: 0, adds: 0, drops: 0, trades: 0 };
          byManagerSeason.set(key, record);
        }

        record.moves += 1;
        if (transaction.type === "trade") {
          record.trades += 1;
        } else {
          const adds = Object.values(transaction.adds ?? {});
          const drops = Object.values(transaction.drops ?? {});
          if (adds.includes(rosterId)) record.adds += 1;
          if (drops.includes(rosterId)) record.drops += 1;
        }
      }
    }

    return [...byManagerSeason].map(([key, record]): StatEntry => {
      const [managerId, yearKey] = key.split("|");
      const year = Number(yearKey);

      return {
        value: record.moves,
        subject: managerId,
        href: `/managers/${managerId}`,
        detail:
          `${year}: ${record.adds} adds, ${record.drops} drops, ` +
          `${record.trades} trades`,
        year,
      };
    });
  },
});
