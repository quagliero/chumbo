import { getPlayer, seasons } from "@/data";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { defineStat } from "./registry";
import type { Game, StatContext, StatEntry } from "./types";

/**
 * Draft records (C4).
 *
 * Like the matchup records, these read the flattened team-week list rather than
 * walking the seasons — with one addition the flattened list cannot carry: the
 * drafts themselves, which come straight from `seasons[year].picks`.
 *
 * Two decisions the numbers depend on, stated once here because every stat
 * below inherits them:
 *
 * **A pick is scored by what the drafting team got.** `pointsForDrafter` is the
 * player's points while he was on the roster that drafted him, bench included.
 * The alternative — everything he scored that season, wherever he played — is a
 * cleaner measure of "was he a good player", but it is a worse measure of a
 * draft pick: it would credit a manager who cut a league-winner in week 2 with
 * the whole season. Measuring what you actually got means a bust you dropped
 * scores you nothing, which is exactly the story of a bust. The cost is that a
 * player traded away in-season looks like a miss, so any entry where that
 * happened says so in its detail, and `one-that-got-away` is the other half of
 * the same picture.
 *
 * **The baseline is the overall pick number, not the round.** Pick 11 takes
 * roughly the eleventh-best player left whether the league has ten teams or
 * twelve, so overall pick number pools the 2012-2013 ten-team drafts with the
 * rest honestly, where "round 2, slot 1" would be comparing pick 11 against
 * pick 13. See `baselineByPickNumber` for how the thin end is handled.
 */

/**
 * A season needs this many played weeks before its picks can be scored.
 *
 * Without it, a draft with a fortnight of football behind it (2026 right now)
 * would put every one of its picks at the bottom of `worst-draft-picks`.
 */
const COMPLETE_SEASON_WEEKS = 14;

/**
 * Half-width, in picks, of the window the baseline averages over.
 *
 * A single pick number has one observation per season — thirteen, and only
 * eleven above pick 150, where the ten-team drafts have already ended. That is
 * far too few to say what pick 137 is worth, and it means the two league sizes
 * contribute unevenly at the tail. Averaging a +/- 6 pick window puts 80-170
 * observations behind every baseline instead, and smooths the seam where the
 * ten-team seasons drop out rather than leaving a step in it.
 */
const BASELINE_WINDOW = 6;

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** For details, where a bare "343" alongside "48.3" reads as a different unit. */
const shown = (value: number) => value.toFixed(1);

/** Defences carry no `full_name`, so fall back to the two halves. */
const playerName = (playerId: string, year?: number): string => {
  const player = getPlayer(playerId, year);
  if (!player) return playerId;
  const joined = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  return player.full_name?.trim() || joined || playerId;
};

/** Name-keyed ids exist pre-2016 ("Michael Turner"), so encode. */
const playerHref = (playerId: string) =>
  `/players/${encodeURIComponent(playerId)}`;

const draftHref = (year: number) => `/seasons/${year}/draft`;

const managerOf = (ownerId: string, fallback: number | string) =>
  getManagerIdBySleeperOwnerId(ownerId) ?? String(fallback);

/* ------------------------------------------------------------------ *
 * Season index: who scored what, for whom.
 * ------------------------------------------------------------------ */

interface SeasonScoring {
  /** player id -> roster id -> points scored for that roster this season. */
  byPlayer: Map<string, Map<number, number>>;
  managerByRoster: Map<number, string>;
  /** Distinct weeks played — the completeness check. */
  weeks: Set<number>;
}

const indexSeasons = (games: Game[]): Map<number, SeasonScoring> => {
  const index = new Map<number, SeasonScoring>();

  for (const game of games) {
    let season = index.get(game.year);
    if (!season) {
      season = {
        byPlayer: new Map(),
        managerByRoster: new Map(),
        weeks: new Set(),
      };
      index.set(game.year, season);
    }

    season.weeks.add(game.week);
    season.managerByRoster.set(
      game.rosterId,
      game.managerId ?? String(game.rosterId)
    );

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

/* ------------------------------------------------------------------ *
 * Scored picks.
 * ------------------------------------------------------------------ */

interface ScoredPick {
  year: number;
  round: number;
  pickNo: number;
  playerId: string;
  /** The internal manager id of whoever made the pick. */
  managerId: string;
  /** Points scored while on the drafting roster. */
  pointsForDrafter: number;
  /** Points scored for everyone else that season, best owner first. */
  elsewhere: Array<{ managerId: string; points: number }>;
}

const totalElsewhere = (pick: ScoredPick) =>
  pick.elsewhere.reduce((sum, owner) => sum + owner.points, 0);

/**
 * Every pick from every season complete enough to score, joined to what its
 * player went on to do. Seasons absent from `games` — anything not yet loaded
 * — simply never appear, rather than arriving as a draft where nobody scored.
 *
 * 2019 is present. Its per-player data is a reconstruction, but it is a good
 * one for this purpose: 96.8% of rostered players and 99.8% of starters carry
 * a score, the average roster is the same size as every other season's (15.0),
 * and the mean points-per-pick (67.7) sits above 2015-2018 rather than below
 * anything. Excluding it lost a whole draft to protect a baseline it does not
 * move. The three stats built on this declare `allowsApproximateLineups`, so
 * their 2019 entries are marked rather than hidden.
 */
const scorePicks = (games: Game[]): ScoredPick[] => {
  const index = indexSeasons(games);
  const scored: ScoredPick[] = [];

  for (const [year, season] of index) {
    if (season.weeks.size < COMPLETE_SEASON_WEEKS) continue;

    for (const pick of seasons[year]?.picks ?? []) {
      const playerId = String(pick.player_id);
      const byRoster = season.byPlayer.get(playerId);

      let pointsForDrafter = 0;
      const elsewhere: ScoredPick["elsewhere"] = [];

      for (const [rosterId, points] of byRoster ?? []) {
        if (rosterId === pick.roster_id) {
          pointsForDrafter += points;
        } else {
          elsewhere.push({
            managerId: season.managerByRoster.get(rosterId) ?? String(rosterId),
            points,
          });
        }
      }

      elsewhere.sort((a, b) => b.points - a.points);

      scored.push({
        year,
        round: pick.round,
        pickNo: pick.pick_no,
        playerId,
        managerId: managerOf(pick.picked_by, pick.roster_id),
        pointsForDrafter,
        elsewhere,
      });
    }
  }

  return scored;
};

/**
 * What a pick at each position is worth, as a moving average over
 * `BASELINE_WINDOW` picks either side. See the note on that constant.
 */
const baselineByPickNumber = (picks: ScoredPick[]): Map<number, number> => {
  const byPickNo = new Map<number, number[]>();
  for (const pick of picks) {
    const bucket = byPickNo.get(pick.pickNo);
    if (bucket) bucket.push(pick.pointsForDrafter);
    else byPickNo.set(pick.pickNo, [pick.pointsForDrafter]);
  }

  const baseline = new Map<number, number>();
  for (const pickNo of byPickNo.keys()) {
    let total = 0;
    let count = 0;
    for (let n = pickNo - BASELINE_WINDOW; n <= pickNo + BASELINE_WINDOW; n++) {
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
 * Both value stats rank the same list — how far above or below the going rate
 * for that pick the player came in — so they are built once, here.
 */
const valueEntries = ({ games }: StatContext): StatEntry[] => {
  const picks = scorePicks(games);
  const baseline = baselineByPickNumber(picks);

  return picks.flatMap((pick) => {
    const expected = baseline.get(pick.pickNo);
    if (expected === undefined) return [];

    // A player traded or cut mid-season shows up here as a miss, which is
    // only half the story — say the other half rather than leave it looking
    // like the data is wrong.
    const gone = totalElsewhere(pick);
    const left = gone > 0 ? `, then ${shown(gone)} elsewhere` : "";

    return [
      {
        value: oneDecimal(pick.pointsForDrafter - expected),
        subject: playerName(pick.playerId, pick.year),
        href: draftHref(pick.year),
        detail:
          `${pick.managerId}, ${pick.year} round ${pick.round} ` +
          `(pick ${pick.pickNo}) — ${shown(pick.pointsForDrafter)} pts ` +
          `against ${shown(expected)} for that slot${left}`,
        year: pick.year,
      },
    ];
  });
};

export const bestDraftPicks = defineStat({
  id: "best-draft-picks",
  label: "Best draft picks",
  description:
    "The picks that returned most above what that slot usually returns. Two hundred points is a steal in round 12 and a catastrophe in round 1, so this ranks on the difference, not the total. Quarterbacks run the board: the going rate for a pick is blind to position, and a late quarterback outscores everyone taken around him.",
  scope: "league",
  format: "points",
  direction: "high",
  allowsApproximateLineups: true,
  compute: valueEntries,
});

export const worstDraftPicks = defineStat({
  id: "worst-draft-picks",
  label: "Worst draft picks",
  description:
    "The other end of the same list: picks that returned least for where they were taken. Almost all of them are early-round players who got hurt, which is the whole risk of a first-rounder.",
  scope: "league",
  format: "points",
  direction: "low",
  allowsApproximateLineups: true,
  compute: valueEntries,
});

/* ------------------------------------------------------------------ *
 * Draft position.
 * ------------------------------------------------------------------ */

/**
 * Finishes are averaged on a twelve-team scale.
 *
 * 2012 and 2013 had ten teams, where finishing 10th is last and in every other
 * season it is mid-table. Stretching each season's finish across a common
 * field — 10th of 10 becomes 12th of 12, 5th of 10 becomes 5.9th of 12 — is
 * what makes the average mean the same thing in both.
 */
const FIELD_SCALE = 12;

const scaleFinish = (finish: number, field: number) =>
  field > 1 ? 1 + ((finish - 1) * (FIELD_SCALE - 1)) / (field - 1) : finish;

interface SlotRecord {
  wins: number;
  losses: number;
  ties: number;
  /** Finishing position, scaled to a twelve-team field. */
  finishes: number[];
  years: number[];
  best?: { year: number; finish: number; field: number };
}

/**
 * Does drafting first actually win anything?
 *
 * Regular-season record is the measure rather than titles: fifteen seasons is
 * enough to say something about a win rate and nowhere near enough to say
 * anything about twelve slots sharing fifteen trophies.
 */
const slotRecords = ({ games }: StatContext): Map<number, SlotRecord> => {
  const records = new Map<number, SlotRecord>();

  // The regular season, per team, per year — one pass, not one per season.
  type Team = { wins: number; losses: number; ties: number; points: number };
  const byYear = new Map<number, { teams: Map<number, Team>; weeks: Set<number> }>();

  for (const game of games) {
    let season = byYear.get(game.year);
    if (!season) {
      season = { teams: new Map(), weeks: new Set() };
      byYear.set(game.year, season);
    }
    season.weeks.add(game.week);
    if (!game.isRegularSeason) continue;

    const team = season.teams.get(game.rosterId) ?? {
      wins: 0,
      losses: 0,
      ties: 0,
      points: 0,
    };
    if (game.result === "win") team.wins += 1;
    else if (game.result === "loss") team.losses += 1;
    else team.ties += 1;
    team.points += game.points;
    season.teams.set(game.rosterId, team);
  }

  for (const [year, { teams, weeks }] of byYear) {
    if (weeks.size < COMPLETE_SEASON_WEEKS) continue;

    const slotToRoster = seasons[year]?.draft?.slot_to_roster_id;
    if (!slotToRoster) continue;

    // Regular-season finish: wins, then points, the league's own tiebreak.
    const order = [...teams.entries()].sort(
      ([, a], [, b]) =>
        b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.points - a.points
    );
    const finishByRoster = new Map(
      order.map(([rosterId], position) => [rosterId, position + 1])
    );

    for (const [slotKey, rosterId] of Object.entries(slotToRoster)) {
      const slot = Number(slotKey);
      const team = teams.get(rosterId);
      const finish = finishByRoster.get(rosterId);
      if (!Number.isFinite(slot) || !team || finish === undefined) continue;

      const record = records.get(slot) ?? {
        wins: 0,
        losses: 0,
        ties: 0,
        finishes: [],
        years: [],
      };
      record.wins += team.wins;
      record.losses += team.losses;
      record.ties += team.ties;
      record.finishes.push(scaleFinish(finish, order.length));
      record.years.push(year);
      if (!record.best || finish < record.best.finish) {
        record.best = { year, finish, field: order.length };
      }
      records.set(slot, record);
    }
  }

  return records;
};

const mean = (values: number[]) =>
  values.reduce((total, value) => total + value, 0) / values.length;

export const draftPositionLuck = defineStat({
  id: "draft-position-luck",
  label: "Is your draft slot worth anything?",
  description:
    "Every regular-season game the league has played, sorted by the slot the team drafted from. Slots 11 and 12 only exist from 2014, when the league went to twelve teams, and finishes from the ten-team years are scaled to a twelve-team field so the averages compare.",
  scope: "league",
  format: "percent",
  direction: "high",
  compute: (context) => {
    const records = slotRecords(context);
    const latest = Math.max(...context.years);

    return [...records.entries()].map(([slot, record]) => {
      const played = record.wins + record.losses + record.ties;
      const winPct = played
        ? ((record.wins + record.ties / 2) / played) * 100
        : 0;
      const best = record.best;

      return {
        value: oneDecimal(winPct),
        subject: `Pick ${slot}`,
        href: draftHref(latest),
        detail:
          `${record.wins}-${record.losses}` +
          (record.ties ? `-${record.ties}` : "") +
          ` over ${record.years.length} drafts — ` +
          `average finish ${shown(mean(record.finishes))} of ` +
          `${FIELD_SCALE}` +
          (best
            ? `, best ${best.finish} of ${best.field} in ${best.year}`
            : ""),
      };
    });
  },
});

/* ------------------------------------------------------------------ *
 * League-wide draft habits.
 * ------------------------------------------------------------------ */

export const mostDraftedPlayers = defineStat({
  id: "most-drafted-players",
  label: "Drafted again and again",
  description:
    "The players this league keeps going back to, across every draft from 2012 on. Counts picks, not seasons rostered — and includes the draft just gone.",
  scope: "player",
  format: "count",
  direction: "high",
  compute: ({ years }) => {
    interface Drafted {
      count: number;
      years: number[];
      byManager: Map<string, number>;
    }
    const drafted = new Map<string, Drafted>();

    // Picks are eager for every season, so this needs no game data at all —
    // which is what lets a draft with no football behind it still count.
    for (const year of years) {
      for (const pick of seasons[year]?.picks ?? []) {
        const playerId = String(pick.player_id);
        const record = drafted.get(playerId) ?? {
          count: 0,
          years: [],
          byManager: new Map<string, number>(),
        };
        const manager = managerOf(pick.picked_by, pick.roster_id);
        record.count += 1;
        record.years.push(year);
        record.byManager.set(manager, (record.byManager.get(manager) ?? 0) + 1);
        drafted.set(playerId, record);
      }
    }

    return [...drafted.entries()]
      .filter(([, record]) => record.count > 1)
      .map(([playerId, record]) => {
        const span = `${Math.min(...record.years)}-${Math.max(...record.years)}`;
        const [keenest] = [...record.byManager.entries()].sort(
          ([aId, a], [bId, b]) => b - a || aId.localeCompare(bId)
        );

        return {
          value: record.count,
          subject: playerName(playerId),
          href: playerHref(playerId),
          detail:
            `${record.count} times, ${span}, by ` +
            `${record.byManager.size} different managers — ` +
            `${keenest[0]} took him ${keenest[1]}x`,
        };
      });
  },
});

/**
 * The one that got away.
 *
 * The version that reads transactions is not possible across this league's
 * history: 2012-2019 have trades and nothing else in their transaction files,
 * so a drop is invisible for eight of the fifteen seasons and the stat would
 * quietly have been a 2020-and-later stat. This is the simpler version the
 * brief allows — drafted by one manager, scoring for another before the season
 * was out — which the flattened game list answers directly and which catches
 * players traded away as well as players cut.
 */
export const oneThatGotAway = defineStat({
  id: "one-that-got-away",
  label: "The one that got away",
  description:
    "Players who were drafted by one manager and spent the season scoring for somebody else. Ranked by the points they put up after they left.",
  scope: "league",
  format: "points",
  direction: "high",
  allowsApproximateLineups: true,
  compute: ({ games }) =>
    scorePicks(games).flatMap((pick) => {
      const [topOwner] = pick.elsewhere;
      if (!topOwner) return [];

      // Only a loss if they did more elsewhere than they did for the drafter.
      const gone = totalElsewhere(pick);
      if (gone <= pick.pointsForDrafter) return [];

      // The value is everything he scored after leaving; where that was split
      // between teams, say so rather than printing one team's share next to
      // a total that does not match it.
      const after =
        pick.elsewhere.length === 1
          ? `${topOwner.managerId} got ${shown(gone)}`
          : `${shown(gone)} went to ${pick.elsewhere.length} other teams, ` +
            `most of it ${topOwner.managerId}'s (${shown(topOwner.points)})`;

      return [
        {
          value: oneDecimal(gone),
          subject: playerName(pick.playerId, pick.year),
          href: playerHref(pick.playerId),
          detail:
            `${pick.managerId} drafted him in round ${pick.round} of ` +
            `${pick.year} and got ${shown(pick.pointsForDrafter)} pts — ` +
            after,
          year: pick.year,
        },
      ];
    }),
});

/** Registered above; exported as a list for anything that wants the set. */
export const draftStats = [
  bestDraftPicks,
  worstDraftPicks,
  draftPositionLuck,
  mostDraftedPlayers,
  oneThatGotAway,
];
