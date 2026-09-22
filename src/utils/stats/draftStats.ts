import { getPlayer, seasons } from "@/data";
import {
  COMPLETE_SEASON_WEEKS,
  replacementLevels,
  scoreDraftPicks,
  withBaseline,
  type DraftPick,
  type ValuedPick,
} from "@/utils/draftValue";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { getPlayerPosition } from "@/utils/playerDataUtils";
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
 * **A pick is valued on everything the player scored that season**, for
 * whoever had him. This used to be only what the drafting roster kept, on the
 * argument that a manager who cut a league-winner in week 2 should not be
 * credited with his season. The cost of that turned out to be worse than the
 * benefit: a player traded before a ball was snapped scored the drafter 0.0
 * and read as a catastrophic pick — Alvin Kamara and Saquon Barkley, picks 4
 * and 6 of 2018, both moved in week 1 in deals for a Le'Veon Bell who then
 * held out all season. Those were good picks and bad trades, and the trade
 * ledger already scores the trades. A draft pick is a bet on a player, and the
 * player is what gets valued; where the points went is the trade's story, and
 * every entry where they went elsewhere says so in its detail.
 * `one-that-got-away` is still about the drafter's share, because that is its
 * subject. The D6 scatter makes the same call, and a test holds them together.
 *
 * **A player is measured against the last starter at his position**, over
 * the weeks he was in somebody's starting lineup (`utils/draftValue.ts`). On
 * raw points the board was a list of quarterbacks — the last starting
 * quarterback scores about twice what the last starting running back does —
 * and a missed or benched week counted as a zero, when his team simply played
 * somebody else.
 *
 * **The baseline is the overall pick number, not the round.** Pick 11 takes
 * roughly the eleventh-best player left whether the league has ten teams or
 * twelve, so overall pick number pools the 2012-2013 ten-team drafts with the
 * rest honestly, where "round 2, slot 1" would be comparing pick 11 against
 * pick 13. See `baselineByPickNumber` in `utils/draftValue.ts` for how the
 * thin end is handled.
 */

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
 * Valued picks — the one model, shared with the draft chart.
 * ------------------------------------------------------------------ */

interface RecordPick extends ValuedPick {
  /** The internal manager id of whoever made the pick. */
  managerId: string;
  /** Who else he scored for, as managers, most first. */
  elsewhereBy: Array<{ managerId: string; points: number }>;
}

/**
 * Every pick from every season complete enough to score, valued by
 * `utils/draftValue.ts` — against the last starter at the player's position,
 * then against the going rate for the pick number — so a record and the chart
 * are the same number. Seasons absent from `games` never appear.
 *
 * 2019 is present. Its bench scores are incomplete, but a season total is
 * within the normal spread of every season around it, and excluding it lost a
 * whole draft to protect a baseline it does not move. The stats built on this
 * declare `allowsIncompleteBench`, so their 2019 entries are marked.
 */
const valuedPicks = (games: Game[]): RecordPick[] => {
  const managerByRoster = new Map<string, string>();
  for (const game of games) {
    managerByRoster.set(`${game.year}|${game.rosterId}`, game.managerId ?? String(game.rosterId));
  }

  const drafts = new Map<number, DraftPick[]>();
  const drafter = new Map<string, string>();
  for (const [key, season] of Object.entries(seasons)) {
    const year = Number(key);
    if (!Number.isFinite(year)) continue;
    drafts.set(
      year,
      (season?.picks ?? []).map((pick) => {
        const playerId = String(pick.player_id);
        drafter.set(`${year}|${pick.pick_no}`, managerOf(pick.picked_by, pick.roster_id));
        return {
          year,
          round: pick.round,
          pickNo: pick.pick_no,
          playerId,
          rosterId: pick.roster_id,
          position: pick.position || getPlayer(playerId, year)?.position || "UNK",
        };
      })
    );
  }

  return withBaseline(
    scoreDraftPicks(games, drafts),
    replacementLevels(games, (id, year) => getPlayerPosition(id, year))
  ).map((pick) => ({
    ...pick,
    managerId: drafter.get(`${pick.year}|${pick.pickNo}`) ?? String(pick.rosterId),
    elsewhereBy: pick.elsewhere.map((owner) => ({
      managerId: managerByRoster.get(`${pick.year}|${owner.rosterId}`) ?? String(owner.rosterId),
      points: owner.points,
    })),
  }));
};

/**
 * Both value stats rank the same list — how far above or below the going rate
 * for that pick the player came in — so they are built once, here.
 */
const signed = (value: number) => `${value < 0 ? "−" : "+"}${shown(Math.abs(value))}`;

const valueEntries = ({ games }: StatContext): StatEntry[] =>
  valuedPicks(games).map((pick) => {
    // Where the points went, when not all of them went to the drafter. The
    // value is the player's whole season; this is who enjoyed it.
    const gone = pick.pointsElsewhere;
    const [topOwner] = pick.elsewhereBy;
    const others =
      pick.elsewhereBy.length === 1
        ? topOwner.managerId
        : `${pick.elsewhereBy.length} other teams`;
    const where =
      gone <= 0
        ? ""
        : pick.points <= 0
          ? `, all of it for ${others}`
          : `, ${shown(gone)} of it for ${others}`;

    return {
      value: oneDecimal(pick.value),
      subject: playerName(pick.playerId, pick.year),
      href: draftHref(pick.year),
      detail:
        `${pick.managerId}, ${pick.year} round ${pick.round} (pick ${pick.pickNo}) — ` +
        `${shown(pick.total)} pts, ${signed(pick.aboveReplacement)} over a starting ` +
        `${pick.position}; that pick usually gives ${signed(pick.baseline)}${where}`,
      year: pick.year,
    };
  });

export const bestDraftPicks = defineStat({
  id: "best-draft-picks",
  label: "Best draft picks",
  description:
    "The picks that returned most for where they were taken. A player is measured against the last starter at his position that season, over the weeks he was in a starting lineup — so a merely adequate quarterback, who outscores every running back, is worth what he is, which is about what twelve teams already had — and then against what that pick number usually returns on the same scale.",
  scope: "league",
  format: "points",
  direction: "high",
  allowsIncompleteBench: true,
  compute: valueEntries,
});

export const worstDraftPicks = defineStat({
  id: "worst-draft-picks",
  label: "Worst draft picks",
  description:
    "The other end of the same list: picks that returned least for where they were taken. A week a player missed, or spent on a bench, is not held against him — his team played somebody else — so this is early picks who started and disappointed, not simply the injured or the late fliers who never got a start.",
  scope: "league",
  format: "points",
  direction: "low",
  allowsIncompleteBench: true,
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
  allowsIncompleteBench: true,
  compute: ({ games }) =>
    valuedPicks(games).flatMap((pick) => {
      const [topOwner] = pick.elsewhereBy;
      if (!topOwner) return [];

      // Only a loss if they did more elsewhere than they did for the drafter.
      const gone = pick.pointsElsewhere;
      if (gone <= pick.points) return [];

      // The value is everything he scored after leaving; where that was split
      // between teams, say so rather than printing one team's share next to
      // a total that does not match it.
      const after =
        pick.elsewhereBy.length === 1
          ? `${topOwner.managerId} got ${shown(gone)}`
          : `${shown(gone)} went to ${pick.elsewhereBy.length} other teams, ` +
            `most of it ${topOwner.managerId}'s (${shown(topOwner.points)})`;

      return [
        {
          value: oneDecimal(gone),
          subject: playerName(pick.playerId, pick.year),
          href: playerHref(pick.playerId),
          detail:
            `${pick.managerId} drafted him in round ${pick.round} of ` +
            `${pick.year} and got ${shown(pick.points)} pts — ` +
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
