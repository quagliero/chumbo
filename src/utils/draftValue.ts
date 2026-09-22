import type { Game } from "@/utils/stats/types";

/**
 * The draft value scatter (D6) — the derivation.
 *
 * Every pick in league history against what it returned. The two judgements
 * this rests on are NOT new: they are the ones `utils/stats/draftStats.ts`
 * already made for `best-draft-picks`, restated here so the scatter and the
 * records tables cannot drift apart.
 *
 * **A pick is valued on everything the player scored that season** — `total`,
 * wherever he was rostered, bench included. It used to be only what the
 * drafting roster kept, and that put Alvin Kamara and Saquon Barkley, picks 4
 * and 6 of 2018, on the floor of the chart at 0.0: both were traded in week 1,
 * in deals built around a Le'Veon Bell who then sat out the whole season. The
 * picks were good; the trades were bad, and the trade ledger already scores
 * those. What a pick is worth is what the player did; who ended up enjoying it
 * is the trade's story, so the split is kept beside the total — `points` for
 * the drafter, `pointsElsewhere` for everyone else — for the popover to tell.
 * `draftStats.ts` makes the same call (I3).
 *
 * **The baseline is the overall pick number, not the round.** Pick 11 takes
 * roughly the eleventh-best player left whether the league has ten teams or
 * twelve, so pooling the 2012-2013 ten-team drafts with the rest on pick
 * number is honest, where "round 2, slot 1" would compare pick 11 against
 * pick 13.
 *
 * **A player is measured against the last starter at his position, over the
 * weeks he started.** Raw
 * points made the board a list of quarterbacks: the last starting QB in a
 * season scores about 210, the last starting running back about 105, so a
 * merely-adequate quarterback taken in round 10 outscored everyone picked near
 * him and read as a steal — when he was what twelve teams already had. So a
 * player's season is taken relative to the last starter at his position that
 * season (`replacementLevels`), over the weeks he was in somebody's starting
 * lineup — the weeks his score was somebody's score — and the going rate for
 * a pick number is measured on the same scale. The last STARTER rather than the first player
 * off the bench, because the data only has points for rostered players, and
 * the thirteenth quarterback in a one-quarterback league is usually on
 * nobody's roster: measuring against him would flatter quarterbacks again.
 *
 * One implementation: `draftStats.ts` (the best and worst picks) and the
 * scatter both call this, so a record and the chart cannot disagree.
 */

/**
 * A season needs this many played weeks before its picks can be scored.
 *
 * Same number, and the same reason, as `draftStats.ts`: a draft with a
 * fortnight of football behind it (2026 right now) would otherwise lay all 180
 * of its picks along the floor of the chart and invent a league-wide collapse
 * in draft value.
 */
export const COMPLETE_SEASON_WEEKS = 14;

/**
 * Half-width, in picks, of the window the baseline averages over.
 *
 * One pick number has one observation per season — fourteen, and only twelve
 * above pick 150, where the ten-team drafts have already ended. A +/- 6 window
 * puts 80-170 observations behind each baseline instead, and smooths the seam
 * where the ten-team seasons drop out rather than leaving a step in the curve.
 */
export const BASELINE_WINDOW = 6;

/** A draft pick, reduced to the fields scoring it needs. */
export interface DraftPick {
  year: number;
  round: number;
  pickNo: number;
  playerId: string;
  /** The roster that made the pick. Points are attributed to this roster only. */
  rosterId: number;
  /** His position that season: what he is measured against. */
  position: string;
}

export interface ScoredPick extends DraftPick {
  /** Everything the player scored that season, for anyone. What is valued. */
  total: number;
  /** The part of `total` scored while on the drafting roster. */
  points: number;
  /** The part of `total` scored for anybody else. */
  pointsElsewhere: number;
  /** Who else he scored for, most first — for saying where the points went. */
  elsewhere: Array<{ rosterId: number; points: number }>;
  /** Weeks he was in somebody's starting lineup — the weeks that counted. */
  started: number;
  /** What he scored in those weeks. */
  startedPoints: number;
}

export interface ValuedPick extends ScoredPick {
  /** What the last starter at his position averaged a start that season. */
  replacementPerGame: number;
  /** That, over the weeks he started: what a last starter would have scored. */
  replacement: number;
  /** `startedPoints − replacement`: his starts, against a starter at his position. */
  aboveReplacement: number;
  /** What a pick at this number has returned on average, on the same scale. */
  baseline: number;
  /** `aboveReplacement − baseline`. Positive is a steal, negative a bust. */
  value: number;
}

interface SeasonScoring {
  /** player id -> roster id -> points scored for that roster this season. */
  byPlayer: Map<string, Map<number, number>>;
  /** player id -> the weeks he was in somebody's starting lineup, and what he scored in them. */
  starts: Map<string, { weeks: number; points: number }>;
  /** Distinct weeks played — the completeness check. */
  weeks: Set<number>;
}

/**
 * Who scored what, for whom, in each season.
 *
 * Fed from `games` (paired matchups) rather than `teamWeeks`, which is what
 * `draftStats.ts` reads. The 48 unpaired team-weeks that drops belong to
 * eliminated teams in late playoff weeks; counting them here and not there
 * would have the chart and the records tables disagree about the same pick.
 */
const indexSeasons = (games: readonly Game[]): Map<number, SeasonScoring> => {
  const index = new Map<number, SeasonScoring>();

  for (const game of games) {
    let season = index.get(game.year);
    if (!season) {
      season = { byPlayer: new Map(), starts: new Map(), weeks: new Set() };
      index.set(game.year, season);
    }
    season.weeks.add(game.week);

    for (const [playerId, points] of Object.entries(game.playersPoints)) {
      if (!Number.isFinite(points)) continue;
      let byRoster = season.byPlayer.get(playerId);
      if (!byRoster) {
        byRoster = new Map();
        season.byPlayer.set(playerId, byRoster);
      }
      byRoster.set(game.rosterId, (byRoster.get(game.rosterId) ?? 0) + points);
    }

    // The weeks that mattered: in a starting lineup, where a player's week is
    // somebody's score. A week on a bench, hurt or on a bye is a week his team
    // played somebody else, and is neither held against him nor credited.
    (game.starters ?? []).forEach((starter, slot) => {
      if (!starter || starter === "0") return;
      const points = game.startersPoints?.[slot];
      if (!Number.isFinite(points)) return;
      const start = season!.starts.get(starter) ?? { weeks: 0, points: 0 };
      start.weeks += 1;
      start.points += points;
      season!.starts.set(starter, start);
    });
  }

  return index;
};

/**
 * Join every pick to what its player went on to do that season.
 *
 * A season absent from `games`, or with less football behind it than
 * `COMPLETE_SEASON_WEEKS`, contributes no picks at all — rather than arriving
 * as a draft in which nobody scored.
 */
export const scoreDraftPicks = (
  games: readonly Game[],
  drafts: ReadonlyMap<number, readonly DraftPick[]>
): ScoredPick[] => {
  const index = indexSeasons(games);
  const scored: ScoredPick[] = [];

  for (const [year, picks] of drafts) {
    const season = index.get(year);
    if (!season || season.weeks.size < COMPLETE_SEASON_WEEKS) continue;

    for (const pick of picks) {
      const byRoster = season.byPlayer.get(pick.playerId);

      let points = 0;
      let pointsElsewhere = 0;
      const elsewhere: ScoredPick["elsewhere"] = [];
      for (const [rosterId, scoredPoints] of byRoster ?? []) {
        if (rosterId === pick.rosterId) points += scoredPoints;
        else {
          pointsElsewhere += scoredPoints;
          elsewhere.push({ rosterId, points: scoredPoints });
        }
      }
      elsewhere.sort((a, b) => b.points - a.points);

      scored.push({
        ...pick,
        total: points + pointsElsewhere,
        points,
        pointsElsewhere,
        elsewhere,
        started: season.starts.get(pick.playerId)?.weeks ?? 0,
        startedPoints: season.starts.get(pick.playerId)?.points ?? 0,
      });
    }
  }

  return scored;
};

/**
 * What a pick at each number is worth, as a moving average over `window` picks
 * either side. See the note on `BASELINE_WINDOW`.
 */
export const baselineByPickNumber = (
  picks: readonly { pickNo: number; total: number; aboveReplacement?: number }[],
  window = BASELINE_WINDOW
): Map<number, number> => {
  const byPickNo = new Map<number, number[]>();
  for (const pick of picks) {
    const measure = pick.aboveReplacement ?? pick.total;
    const bucket = byPickNo.get(pick.pickNo);
    if (bucket) bucket.push(measure);
    else byPickNo.set(pick.pickNo, [measure]);
  }

  const baseline = new Map<number, number>();
  for (const pickNo of byPickNo.keys()) {
    let total = 0;
    let count = 0;
    for (let n = pickNo - window; n <= pickNo + window; n++) {
      for (const points of byPickNo.get(n) ?? []) {
        total += points;
        count += 1;
      }
    }
    if (count) baseline.set(pickNo, total / count);
  }

  return baseline;
};

/**
 * The scored picks, measured against the last starter at their position
 * (`levels`, from `replacementLevels`) and then against the going rate for
 * their pick number on that scale.
 *
 * With no levels at all every replacement is zero, and a pick is valued on
 * what he scored in the weeks he started — which is what the unit tests pin
 * the arithmetic on.
 * A position the season has no level for (a stray "DB" from 2012) is measured
 * against that season's LOWEST level, so an oddity is never made a steal.
 */
export const withBaseline = (
  picks: readonly ScoredPick[],
  levels: ReplacementLevels = new Map()
): ValuedPick[] => {
  const positioned = picks.map((pick) => {
    const season = levels.get(pick.year);
    const replacementPerGame =
      season?.get(normalisePosition(pick.position)) ??
      (season?.size ? Math.min(...season.values()) : 0);
    // Only the weeks he started. A week he missed, or sat on a bench, was a
    // week his team played somebody else: it costs the gap to a replacement,
    // which is nothing, not his whole average — so a quarterback who broke his
    // ankle in week 3 is not the worst pick in history for the weeks he never
    // played, and a round-10 back stashed on a bench all year is not charged
    // for scoring 1.2 in weeks nobody started him.
    const replacement = replacementPerGame * pick.started;
    return {
      ...pick,
      replacementPerGame,
      replacement,
      aboveReplacement: pick.startedPoints - replacement,
    };
  });
  const baseline = baselineByPickNumber(positioned);

  return positioned.flatMap((pick) => {
    const expected = baseline.get(pick.pickNo);
    // Unreachable for a pick that helped build the map, but the map is keyed
    // on a number and this keeps the type honest rather than asserting.
    if (expected === undefined) return [];
    return [{ ...pick, baseline: expected, value: pick.aboveReplacement - expected }];
  });
};

/* ------------------------------------------------------ the last starter */

/** season -> position -> what the last starter at that position averaged a game. */
export type ReplacementLevels = Map<number, Map<string, number>>;

/**
 * The lineup every season has used, 2012 to now: one quarterback, two backs,
 * two receivers, a tight end, a flex, a kicker and a defence.
 * `draftValue.test.ts` checks every season's settings still say so, so a
 * lineup change fails loudly instead of quietly mis-measuring a position.
 */
export const STARTING_SLOTS: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  K: 1,
  DEF: 1,
};
const FLEX_ELIGIBLE = ["RB", "WR", "TE"];

/** How many of the last starters are averaged, so one odd season is not the level. */
const LEVEL_SPAN = 3;

export const normalisePosition = (position: string) =>
  position === "DST" || position === "D/ST" ? "DEF" : position;

/**
 * What the last starter at each position scored, each season.
 *
 * How many starters a position has is the teams times its slots, plus its
 * share of the flex — and that share is MEASURED, from who actually started
 * there (a lineup with three backs has one in the flex): about half backs,
 * half receivers, a few tight ends. The level is the mean of the last
 * `LEVEL_SPAN` starters' points per start (ranked by what they scored while
 * starting), so one strange season at the margin does not set it alone. Per
 * START, because a player is then measured over the weeks he started
 * (`withBaseline`): a missed or benched week is somebody else's, not a zero.
 *
 * `positionOf` is the caller's, because only the caller has the dictionary.
 */
export const replacementLevels = (
  games: readonly Game[],
  positionOf: (playerId: string, year: number) => string
): ReplacementLevels => {
  const index = indexSeasons(games);
  const lineups = new Map<number, { rosters: Set<number>; flex: Map<string, number>; flexStarts: number }>();
  for (const game of games) {
    let season = lineups.get(game.year);
    if (!season) {
      season = { rosters: new Set(), flex: new Map(), flexStarts: 0 };
      lineups.set(game.year, season);
    }
    season.rosters.add(game.rosterId);
    // Who played the flex: whatever a lineup has of a flex position beyond
    // that position's own slots.
    const started = new Map<string, number>();
    for (const starter of game.starters ?? []) {
      if (!starter || starter === "0") continue;
      const position = normalisePosition(positionOf(starter, game.year));
      started.set(position, (started.get(position) ?? 0) + 1);
    }
    for (const position of FLEX_ELIGIBLE) {
      const extra = (started.get(position) ?? 0) - STARTING_SLOTS[position];
      if (extra > 0) {
        season.flex.set(position, (season.flex.get(position) ?? 0) + extra);
        season.flexStarts += extra;
      }
    }
  }

  const levels: ReplacementLevels = new Map();
  for (const [year, scoring] of index) {
    const lineup = lineups.get(year);
    if (!lineup) continue;
    const byPosition = new Map<string, { total: number; played: number }[]>();
    for (const [playerId, start] of scoring.starts) {
      if (!start.weeks) continue;
      const position = normalisePosition(positionOf(playerId, year));
      if (!(position in STARTING_SLOTS)) continue;
      const list = byPosition.get(position) ?? [];
      list.push({ total: start.points, played: start.weeks });
      byPosition.set(position, list);
    }
    const teams = lineup.rosters.size;
    const seasonLevels = new Map<string, number>();
    for (const [position, slots] of Object.entries(STARTING_SLOTS)) {
      const players = (byPosition.get(position) ?? []).sort((a, b) => b.total - a.total);
      if (!players.length) continue;
      const flexShare = lineup.flexStarts
        ? (lineup.flex.get(position) ?? 0) / lineup.flexStarts
        : 0;
      // Never more starters than there were players who started: a thin
      // position's last starter is the last one there is.
      const starters = Math.min(
        players.length,
        Math.max(1, Math.round(teams * (slots + flexShare)))
      );
      const last = players.slice(Math.max(0, starters - LEVEL_SPAN), starters);
      seasonLevels.set(
        position,
        last.reduce((sum, p) => sum + p.total / p.played, 0) / last.length
      );
    }
    levels.set(year, seasonLevels);
  }
  return levels;
};
