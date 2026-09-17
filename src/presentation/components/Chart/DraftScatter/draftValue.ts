import type { Game } from "@/utils/stats/types";

/**
 * The draft value scatter (D6) — the derivation.
 *
 * Every pick in league history against what it returned. The two judgements
 * this rests on are NOT new: they are the ones `utils/stats/draftStats.ts`
 * already made for `best-draft-picks`, restated here so the scatter and the
 * records tables cannot drift apart.
 *
 * **A pick is scored by what the DRAFTING team got.** `points` is the player's
 * points while on the roster that drafted him, bench included. Anything he
 * scored elsewhere after being cut or traded is kept separately, as
 * `pointsElsewhere`, so a point low on the chart can say which kind of miss it
 * was rather than looking like bad data.
 *
 * **The baseline is the overall pick number, not the round.** Pick 11 takes
 * roughly the eleventh-best player left whether the league has ten teams or
 * twelve, so pooling the 2012-2013 ten-team drafts with the rest on pick
 * number is honest, where "round 2, slot 1" would compare pick 11 against
 * pick 13.
 *
 * Why this lives here rather than calling into `draftStats.ts`: that module's
 * `scorePicks` is private to it and its stats return a ranked top-N, where a
 * scatter needs all 2,460 picks. Widening `scorePicks` and importing it is the
 * better end state — see the D6 report.
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
}

export interface ScoredPick extends DraftPick {
  /** Points scored while on the drafting roster, bench included. */
  points: number;
  /** Points the same player scored for anybody else that season. */
  pointsElsewhere: number;
}

export interface ValuedPick extends ScoredPick {
  /** What a pick at this number has returned on average, league-wide. */
  baseline: number;
  /** `points − baseline`. Positive is a steal, negative a bust. */
  value: number;
}

interface SeasonScoring {
  /** player id -> roster id -> points scored for that roster this season. */
  byPlayer: Map<string, Map<number, number>>;
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
      season = { byPlayer: new Map(), weeks: new Set() };
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
      for (const [rosterId, scoredPoints] of byRoster ?? []) {
        if (rosterId === pick.rosterId) points += scoredPoints;
        else pointsElsewhere += scoredPoints;
      }

      scored.push({ ...pick, points, pointsElsewhere });
    }
  }

  return scored;
};

/**
 * What a pick at each number is worth, as a moving average over `window` picks
 * either side. See the note on `BASELINE_WINDOW`.
 */
export const baselineByPickNumber = (
  picks: readonly ScoredPick[],
  window = BASELINE_WINDOW
): Map<number, number> => {
  const byPickNo = new Map<number, number[]>();
  for (const pick of picks) {
    const bucket = byPickNo.get(pick.pickNo);
    if (bucket) bucket.push(pick.points);
    else byPickNo.set(pick.pickNo, [pick.points]);
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

/** The scored picks with the going rate for their slot attached. */
export const withBaseline = (picks: readonly ScoredPick[]): ValuedPick[] => {
  const baseline = baselineByPickNumber(picks);

  return picks.flatMap((pick) => {
    const expected = baseline.get(pick.pickNo);
    // Unreachable for a pick that helped build the map, but the map is keyed
    // on a number and this keeps the type honest rather than asserting.
    if (expected === undefined) return [];
    return [{ ...pick, baseline: expected, value: pick.points - expected }];
  });
};
