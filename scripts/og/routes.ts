/**
 * Which pages get prerendered, what they say, and which card they show (G6).
 *
 * ## The scope decision, which is most of this task
 *
 * The plan asks for "at minimum per manager, per season, per player". Counted
 * honestly, the routes available are:
 *
 * | Group | Count | In the default set |
 * | --- | --- | --- |
 * | manager (`/managers/:id`) | 17 | yes |
 * | season (`/seasons/:year/standings`) | 15 | yes |
 * | head-to-head (`/h2h/:a/:b`) | 234 ordered pairs that have met | yes |
 * | week recap (`/seasons/:y/matchups/:w`, J2) | every played week, ~240 | yes |
| matchup preview (`/seasons/:y/matchups/:w/:id`, K1) | next week's games, 6 | yes |
| matchup (`/seasons/:y/matchups/:w/:id`) | 1,294 | **no**, `--group matchups` |
 * | player (`/players/:id`) | 4,389 | **no**, and not implemented |
 *
 * The default set is 266 pages and 266 cards — 25 seconds and 25 MB of `dist`,
 * measured, at about 94 kB a card.
 *
 * **Head-to-head is in, and it is the point.** "Every head-to-head ever
 * played. Settle the argument" is the site's own pitch, `h2hRecordCard` is
 * G2's card "that exists to end an argument", and a record shared into the
 * group chat is the exact behaviour workstream G was written for. Both orders
 * of each pair are generated because the site links both ways (the H2H matrix
 * emits `/h2h/:row/:col` for every cell) and the card's record reads from the
 * left-hand manager's point of view — serving `/h2h/jay/thd` a card that leads
 * with thd's wins is the one thing `h2hRecord.ts` says must not be misread.
 *
 * **Matchups are implemented but off by default.** `finalScoreCard` fits them
 * perfectly and they are the most shareable fact on the site, but 1,294 routes
 * is two minutes of rasterising and ~120 MB of `dist/` on every deploy, for a
 * long tail of week-4-of-2013 games nobody will ever link. `--group matchups`
 * turns them on, and `--since <year>` narrows them, so the day somebody wants
 * this season's games previewable it is a flag, not a rewrite.
 *
 * **Players are out, for now.** There was no player card when this was
 * written; I4 added `playerCareerCard`, so a player route is now one function
 * here. The reason it has not been written is the count — 4,389 pages — and
 * the per-player stats, which today live in a React hook (`usePlayerStats`)
 * this script cannot call. Moving that computation out of the hook is the
 * first step. Prerendering 4,389 HTML files with
 * *only* text tags was the other option and is worse than it looks: it is
 * ~9 MB of `dist` and it would make the player pages the only ones whose
 * preview is a portrait crest in a `summary` card, which is the state G5
 * already described as "a bare grey URL" with extra steps.
 *
 * ## What a route owes the reader
 *
 * Every title and description here is assembled from the same committed JSON
 * the pages render from, through the same helpers (`getManagerStats`,
 * `getFinalStandings`, `getAllTimeH2HRecord`) — so a preview cannot claim
 * something the page contradicts, and a data fix propagates to both. The cards
 * take their sentence from `narrate()` (E7) rather than inventing one, which is
 * also how the 2019 caveat reaches them: `Note.approximate` is threaded
 * straight through and every template renders it.
 */

import fs from "node:fs";
import path from "node:path";

import { managers, seasons } from "@/data";
import { CURRENT_YEAR, YEARS } from "@/domain/constants";
import { getManagerAccent } from "@/domain/managerColors";
import { completedSeasons } from "@/utils/hallOfFame";
import { getFinalPosition, getFinalStandings } from "@/utils/finalStandings";
import { seasonBadge } from "@/utils/seasonBadge";
import { getManagerStats } from "@/utils/managerStats";
import { narrate, type Note } from "@/utils/narrative/narrate";
import {
  PRECOMPUTED_VERSION,
  type PrecomputedStats,
} from "@/utils/stats/precomputed";
import { getTeamName } from "@/utils/teamName";
import type { ShareCard } from "@/presentation/components/ShareCard/card";
import {
  finalScoreCard,
  formatPoints,
  formatRecord,
  h2hRecordCard,
  managerCareerCard,
  managerSeasonCard,
  matchupPreviewCard,
  weekRecapCard,
} from "@/presentation/components/ShareCard/templates";
import {
  avatarUrlFor,
  h2hData,
  managerCareerData,
  matchupPreviewData,
  weekRecapData,
} from "@/presentation/shareCards/cardData";
import { seriesText } from "@/presentation/components/MatchupPreview/format";
import {
  fixturesFor,
  formatOdds,
  previewWeek,
  stakesFor,
} from "@/utils/matchupPreview";
import { completedWeeks } from "@/utils/weekRecap";

import { ordinal } from "./tags";

/** The bitmaps every card draws from, fetched once per run by the driver. */
export interface CardAssets {
  /** `public/images/logo.png` as a data URI, or null. */
  crest: string | null;
  /** Avatar data URIs by the URL they came from. Misses are null. */
  avatars: Map<string, string | null>;
}

/** One page to prerender. */
export interface OgRoute {
  /** The SPA path, leading slash, no trailing slash. */
  path: string;
  title: string;
  description: string;
  /** Alt text for the card, when there is one. */
  imageAlt?: string;
  /** Avatar URLs this route's card wants, so they can be fetched up front. */
  avatarUrls: string[];
  /**
   * The card, or undefined for a page with nothing honest to draw — a season
   * nobody has played a game in yet. Those pages still get their own title and
   * description and fall back to the crest, which is strictly better than the
   * generic home-page copy they get today.
   */
  card?: (assets: CardAssets) => ShareCard;
}

export const ROUTE_GROUPS = [
  "seasons",
  "managers",
  "h2h",
  "weeks",
  "previews",
  "matchups",
] as const;
export type RouteGroup = (typeof ROUTE_GROUPS)[number];

/** The groups generated when nothing is asked for. See the table above. */
export const DEFAULT_GROUPS: RouteGroup[] = [
  "seasons",
  "managers",
  "h2h",
  "weeks",
  "previews",
];

/* ------------------------------------------------------------------ helpers */

/** `managers.json` carries fields `Manager` does not declare. Only `active` matters here. */
type ManagerRecord = (typeof managers)[number] & { active?: boolean };

const allManagers = managers as ManagerRecord[];

const managerById = new Map(allManagers.map((m) => [m.id, m]));
const managerIdByOwner = new Map(allManagers.map((m) => [m.sleeper.id, m.id]));

/**
 * The narrative engine's input, read off disk.
 *
 * `loadPrecomputedStats` is a browser `fetch` against `/data/all-time.json`;
 * the file itself is committed (A4), so in Node it is just a read. A version
 * mismatch is treated as "no notes" rather than as an error: a stale file means
 * the sentences would be about a different stat registry, and a card with no
 * sentence is fine where a card with a wrong one is not.
 */
const loadStats = (): PrecomputedStats | null => {
  try {
    const file = path.resolve(process.cwd(), "public/data/all-time.json");
    const payload = JSON.parse(fs.readFileSync(file, "utf8")) as PrecomputedStats;
    return payload.version === PRECOMPUTED_VERSION ? payload : null;
  } catch {
    return null;
  }
};

const stats = loadStats();

/** Which stat a note came from, so a card can refuse one that does not fit it. */
const scopeById = new Map(stats?.stats.map((s) => [s.id, s.scope]) ?? []);

/**
 * The best sentence E7 has for this subject, if one of them fits the card.
 *
 * The scope filter is not fussiness. `narrate` matches on *subject* — a manager
 * id, a year, a week — and several stats share a subject without sharing a
 * frame of reference, so a manager-season card asking for anything at all gets
 * offered "The 2nd-most notable week on this date in Chumbo history" (the
 * league-scoped `on-this-day` stat, which is true and belongs on E6's rail, not
 * under somebody's season record). The scope comes from the registry via
 * `all-time.json` rather than from a list of stat ids kept here, so a new stat
 * lands in the right place without this file knowing about it.
 */
const noteFor = (
  subject: { managerIds?: string[]; year?: number; week?: number },
  scopes: string[]
): Note | undefined =>
  narrate(stats, subject, { limit: 8 }).find((note) =>
    scopes.includes(scopeById.get(note.statId) ?? "")
  );

/** A card about one manager in one season takes a note about either. */
const SEASON_SCOPES = ["manager", "season"];

/**
 * Seasons that have actually been completed, per the winners bracket.
 *
 * Worked out on first use, not at import: the brackets are loaded on demand
 * (A2b), and at import time `prerender-og.ts` has not yet awaited
 * `loadAllSeasons()`.
 */
let completed: Set<number> | null = null;
const isCompleted = (year: number): boolean =>
  (completed ??= new Set(completedSeasons())).has(year);

/** Weeks with a scored game, which is what "has this season started" means. */
const hasPlayedGames = (year: number): boolean =>
  Object.values(seasons[year]?.matchups ?? {}).some((week) =>
    (week ?? []).some((side) => (side.points ?? 0) > 0)
  );

const rosterOwner = (year: number, rosterId: number): string | undefined =>
  seasons[year]?.rosters?.find((r) => r.roster_id === rosterId)?.owner_id;

const avatarOf = (assets: CardAssets, url: string | null) =>
  url ? assets.avatars.get(url) ?? null : null;

/** A W–L record as prose: "9–5". Shared by the copy and the cards. */
const record = (wins: number, losses: number, ties: number) =>
  formatRecord(wins, losses, ties);

/* ------------------------------------------------------------------ seasons */

/**
 * One page per season, at the standings tab.
 *
 * `/seasons/:year` is *not* a route — it falls through to `/:tab/:subTab` and
 * renders the home page — so the canonical season URL is the one the site's own
 * links use, `/seasons/:year/standings`.
 *
 * The card is the champion's season, because that is what a season *was*. An
 * in-progress season has no champion, so it shows the current leader with no
 * badge and no finish; a season with no games played yet shows no card at all
 * rather than a 0–0 one.
 */
const seasonRoutes = (): OgRoute[] =>
  [...YEARS]
    .sort((a, b) => b - a)
    .map((year) => {
      const isComplete = isCompleted(year);
      const played = hasPlayedGames(year);
      const leaderRosterId = played
        ? getFinalStandings(year).find((s) => s.position === 1)?.rosterId
        : undefined;
      const ownerId =
        leaderRosterId === undefined ? undefined : rosterOwner(year, leaderRosterId);
      const managerId = ownerId ? managerIdByOwner.get(ownerId) : undefined;
      const manager = managerId ? managerById.get(managerId) : undefined;
      const season = managerId
        ? getManagerStats(managerId)?.seasonStats.find((s) => s.year === year)
        : undefined;

      const tail =
        "Final standings, every matchup, the draft board and the trades.";
      const title = `The ${year} Chumbo season`;

      if (!manager || !season || !managerId) {
        return {
          path: `/seasons/${year}/standings`,
          title,
          description: played
            ? `${year} in the Chumbo. ${tail}`
            : `${year} in the Chumbo, before a game has been played. The draft board is up; the rest fills in week by week.`,
          avatarUrls: [],
        };
      }

      const avatarUrl = avatarUrlFor(year, manager.sleeper.id);
      const rec = record(season.wins, season.losses, season.ties);
      const position = getFinalPosition(year, leaderRosterId as number);

      return {
        path: `/seasons/${year}/standings`,
        title,
        description: isComplete
          ? `${manager.name} won the ${year} Chumbo, ${rec} with ${formatPoints(
              season.pointsFor
            )} points. ${tail}`
          : `${year} is still being played — ${manager.name} leads at ${rec}. ${tail}`,
        imageAlt: isComplete
          ? `${manager.name} won the ${year} Chumbo, ${rec}`
          : `${manager.name} leads the ${year} Chumbo at ${rec}`,
        avatarUrls: avatarUrl ? [avatarUrl] : [],
        card: (assets) =>
          managerSeasonCard({
            year,
            manager: {
              name: manager.name,
              avatar: avatarOf(assets, avatarUrl),
            },
            teamName: getTeamName(manager.sleeper.id, seasons[year]?.users),
            wins: season.wins,
            losses: season.losses,
            ties: season.ties,
            pointsFor: season.pointsFor,
            finish: isComplete && position ? ordinal(position) : undefined,
            badge: isComplete ? seasonBadge(year, managerId) : undefined,
            accent: getManagerAccent(managerId),
            crest: assets.crest,
            note: noteFor({ managerIds: [managerId], year }, SEASON_SCOPES),
          }),
      };
    });

/* ----------------------------------------------------------------- managers */

/**
 * One page per manager.
 *
 * The copy is the career, because that is what the page is — and since I4 so
 * is the card: `managerCareerCard`, built from `shareCards/cardData`, the same
 * data the "Copy career card" button in the page header uses. It used to show
 * their best season, only because no career template existed; a preview and
 * the page's own card now cannot be two different pictures.
 */
const managerRoutes = (): OgRoute[] =>
  allManagers.flatMap((manager): OgRoute[] => {
    const career = getManagerStats(manager.id);
    const data = managerCareerData(manager.id);
    if (!career || !data) return [];

    const careerRecord = record(data.wins, data.losses, data.ties);
    const titleClause =
      data.titles === 0
        ? "no titles yet"
        : data.titles === 1
        ? "one title"
        : `${data.titles} titles`;

    return [
      {
        path: `/managers/${manager.id}`,
        title: `${manager.name}'s Chumbo career`,
        description: `${careerRecord} across ${
          data.seasons
        } seasons, ${titleClause}, ${formatPoints(
          career.totalPointsFor
        )} points. Every season, every head-to-head, every draft pick.`,
        imageAlt: `${manager.name}'s Chumbo career: ${careerRecord}, ${titleClause}`,
        avatarUrls: data.avatarUrl ? [data.avatarUrl] : [],
        card: (assets) =>
          managerCareerCard({
            manager: {
              name: data.name,
              avatar: avatarOf(assets, data.avatarUrl),
            },
            teamName: data.teamName,
            firstYear: data.firstYear,
            lastYear: data.lastYear,
            wins: data.wins,
            losses: data.losses,
            ties: data.ties,
            titles: data.titles,
            bestFinish: data.bestFinish,
            seasons: data.seasons,
            accent: data.accent,
            crest: assets.crest,
          }),
      },
    ];
  });

/* --------------------------------------------------------------------- h2h */

/**
 * One page per ordered pair that has met, from the left manager's side.
 *
 * **No narrated sentence on this card, deliberately.** It is the one card whose
 * subject is narrower than a note's: `narrate({ managerIds: [a, b] })` matches
 * anything about *either* manager, so `/h2h/thd/jay` was offered "The longest
 * losing streak in Chumbo history" — true of one of them across fifteen
 * seasons, and printed under "thd 9–9 jay" it reads as a claim about the
 * series, which is exactly the card that "claims more than the site does".
 * Notes that really are about a pairing do exist (`rivalry-intensity` has
 * subjects like "fin vs sol", linking straight at `/h2h/fin/sol`) but E7 will
 * not hand one over: `describes()` in `narrate.ts` refuses a non-manager
 * subject when the caller pinned no year or week, because with nothing to pin
 * it to, "some other row of the same stat" is indistinguishable from a match.
 * So the card says what it can stand behind — the record, the span, and the
 * streak in words.
 *
 * Both orders, because the site links both ways and the record is read left to
 * right. Pairs who have never met are skipped: a 0–0 card is not a fact, and
 * `/h2h/jimmie/nick` (eras that never overlapped) is a page the SPA renders
 * perfectly well from the fallback.
 */
const h2hRoutes = (): OgRoute[] => {
  const routes: OgRoute[] = [];
  for (const a of allManagers) {
    for (const b of allManagers) {
      if (a.id === b.id) continue;
      // The same data the page's "Copy head-to-head card" button reads (I4),
      // so the span, the streak and the accent cannot differ between them.
      const pair = h2hData(a.id, b.id);
      if (!pair || pair.meetings === 0) continue;

      const { wins, losses, ties } = pair;
      const rowRecord = record(wins, losses, ties);
      const lead =
        wins > losses
          ? `${a.name} leads ${b.name} ${rowRecord}`
          : losses > wins
          ? `${b.name} leads ${a.name} ${record(losses, wins, ties)}`
          : `${a.name} and ${b.name} are level at ${rowRecord}`;

      routes.push({
        path: `/h2h/${a.id}/${b.id}`,
        title: `${a.name} vs ${b.name} — head to head`,
        description: `${lead} all time in the Chumbo regular season, over ${
          pair.meetings
        } meetings, averaging ${pair.avgA.toFixed(1)} points to ${pair.avgB.toFixed(
          1
        )}. Every game they have played.`,
        imageAlt: `${a.name} vs ${b.name}, ${rowRecord} in the regular season`,
        avatarUrls: [pair.a.avatarUrl, pair.b.avatarUrl].filter(
          (u): u is string => Boolean(u)
        ),
        card: (assets) =>
          h2hRecordCard({
            a: { name: pair.a.name, avatar: avatarOf(assets, pair.a.avatarUrl) },
            b: { name: pair.b.name, avatar: avatarOf(assets, pair.b.avatarUrl) },
            wins,
            losses,
            ties,
            span: pair.span,
            streak: pair.streak,
            accent: pair.accent,
            crest: assets.crest,
          }),
      });
    }
  }
  return routes;
};

/* ---------------------------------------------------------------- matchups */

/**
 * One page per completed matchup. Off by default; see the scope table.
 *
 * `since` exists because this is the group whose cost is unbounded: every
 * season adds ~78 games forever, and the games worth previewing are this
 * season's.
 */
const matchupRoutes = (since: number): OgRoute[] => {
  const routes: OgRoute[] = [];
  for (const year of [...YEARS].sort((a, b) => b - a)) {
    if (year < since) continue;
    const season = seasons[year];
    if (!season) continue;
    for (const [week, sides] of Object.entries(season.matchups ?? {})) {
      const byMatchup = new Map<number, typeof sides>();
      for (const side of sides ?? []) {
        if (side.matchup_id === null || side.matchup_id === undefined) continue;
        if ((side.points ?? 0) <= 0) continue;
        byMatchup.set(side.matchup_id, [
          ...(byMatchup.get(side.matchup_id) ?? []),
          side,
        ]);
      }
      for (const [matchupId, pair] of byMatchup) {
        if (!pair || pair.length !== 2) continue;
        // Highest score on top, which is how every one of these cards reads.
        const [home, away] = [...pair].sort(
          (x, y) => (y.points ?? 0) - (x.points ?? 0)
        );
        const homeOwner = rosterOwner(year, home.roster_id);
        const awayOwner = rosterOwner(year, away.roster_id);
        const homeName = getTeamName(homeOwner ?? "", season.users);
        const awayName = getTeamName(awayOwner ?? "", season.users);
        const winnerId = homeOwner ? managerIdByOwner.get(homeOwner) : undefined;
        const homeAvatar = homeOwner ? avatarUrlFor(year, homeOwner) : null;
        const awayAvatar = awayOwner ? avatarUrlFor(year, awayOwner) : null;
        const weekNumber = Number(week);
        const scoreline = `${homeName} ${(home.points ?? 0).toFixed(1)} – ${awayName} ${(
          away.points ?? 0
        ).toFixed(1)}`;

        routes.push({
          path: `/seasons/${year}/matchups/${week}/${matchupId}`,
          title: `${scoreline} · ${year} week ${week}`,
          description: `${scoreline}, week ${week} of the ${year} Chumbo. Both lineups, every player's points, and what each of them left on the bench.`,
          imageAlt: scoreline,
          avatarUrls: [homeAvatar, awayAvatar].filter((u): u is string =>
            Boolean(u)
          ),
          card: (assets) =>
            finalScoreCard({
              year,
              week: weekNumber,
              teams: [
                {
                  name: homeName,
                  score: home.points ?? 0,
                  avatar: avatarOf(assets, homeAvatar),
                },
                {
                  name: awayName,
                  score: away.points ?? 0,
                  avatar: avatarOf(assets, awayAvatar),
                },
              ],
              accent: winnerId ? getManagerAccent(winnerId) : undefined,
              crest: assets.crest,
              note: noteFor({ year, week: weekNumber }, ["league", "season"]),
            }),
        });
      }
    }
  }
  return routes;
};

/* -------------------------------------------------------------------- weeks */

/**
 * One page per played week: "Week N in the Chumbo" (J2).
 *
 * The description is the recap's own first lines, cut to fit, and the card is
 * the page's share card with the same E7 sentence the page puts on it — the
 * first `narrate()` note for the week — so the preview, the page and a copied
 * card are one set of words. Every week of every season, because the back
 * catalogue is the point: "remember week 7 of 2014" is a link now.
 */
const weekRoutes = (): OgRoute[] =>
  [...YEARS].flatMap((year) =>
    completedWeeks(year).flatMap((week): OgRoute[] => {
      const recap = weekRecapData(year, week);
      if (!recap) return [];
      const facts: string[] = [];
      for (const row of recap.rows) {
        const next = [...facts, `${row.label}: ${row.text}.`].join(" ");
        if (next.length > 280) break;
        facts.push(`${row.label}: ${row.text}.`);
      }
      const [note] = narrate(stats, { year, week }, { limit: 1 });
      return [
        {
          path: `/seasons/${year}/matchups/${week}`,
          title: `Week ${week} in the Chumbo, ${year}`,
          description: facts.join(" "),
          imageAlt: `Week ${week} of ${year}: ${recap.rows
            .slice(0, 2)
            .map((row) => row.text)
            .join("; ")}`,
          avatarUrls: [],
          card: (assets) =>
            weekRecapCard({
              year,
              week,
              playoffs: recap.playoffs,
              rows: recap.rows,
              crest: assets.crest,
              note: note && { text: note.text, approximate: note.approximate },
            }),
        },
      ];
    })
  );

/* ----------------------------------------------------------------- previews */

/**
 * One page per game in the week still to be played (K1), at the address the
 * result will have. Six pages, rebuilt by every automatic update (J1), so the
 * link somebody drops in the group on Tuesday previews the game, and after
 * the next update that same address previews the result instead.
 */
const previewRoutes = (): OgRoute[] => {
  const year = CURRENT_YEAR;
  const week = previewWeek(year);
  if (week === null) return [];
  const stakes = stakesFor(year, week);

  return fixturesFor(year, week).flatMap(([matchupId]): OgRoute[] => {
    const data = matchupPreviewData(year, week, matchupId, stakes);
    if (!data) return [];
    const [a, b] = data.preview.sides;
    const odds = a.stakes
      ? ` A win takes ${a.name}'s playoff odds to ${formatOdds(
          a.stakes.ifWin
        )}; a loss, to ${formatOdds(a.stakes.ifLose)}.`
      : "";
    return [
      {
        path: `/seasons/${year}/matchups/${week}/${matchupId}`,
        title: `${a.name} vs ${b.name} · ${year} week ${week} preview`,
        description: `${seriesText(a, b, data.preview.h2h)}. ${a.name} is ${
          data.a.record
        } this season, ${b.name} ${data.b.record}.${odds}`,
        imageAlt: `${a.name} vs ${b.name}, week ${week} preview`,
        avatarUrls: [data.a.avatarUrl, data.b.avatarUrl].filter(
          (u): u is string => Boolean(u)
        ),
        card: (assets) =>
          matchupPreviewCard({
            year,
            week,
            a: { ...data.a, avatar: avatarOf(assets, data.a.avatarUrl) },
            b: { ...data.b, avatar: avatarOf(assets, data.b.avatarUrl) },
            wins: data.wins,
            losses: data.losses,
            ties: data.ties,
            crest: assets.crest,
            note: data.note ? { text: data.note } : undefined,
          }),
      },
    ];
  });
};

/* ------------------------------------------------------------------- public */

export interface RouteOptions {
  groups?: RouteGroup[];
  /** Earliest season for the `matchups` group. Defaults to the current one. */
  since?: number;
}

/**
 * The routes to prerender.
 *
 * Requires `await loadAllSeasons()` first: everything here reads matchups, and
 * the loader starts them empty, so calling early returns plausible zeros rather
 * than failing (see `scripts/build-aggregates.ts`, same trap).
 */
export const ogRoutes = ({
  groups = DEFAULT_GROUPS,
  since = CURRENT_YEAR,
}: RouteOptions = {}): OgRoute[] => {
  const wanted = new Set(groups);
  return [
    ...(wanted.has("seasons") ? seasonRoutes() : []),
    ...(wanted.has("managers") ? managerRoutes() : []),
    ...(wanted.has("h2h") ? h2hRoutes() : []),
    ...(wanted.has("weeks") ? weekRoutes() : []),
    ...(wanted.has("previews") ? previewRoutes() : []),
    ...(wanted.has("matchups") ? matchupRoutes(since) : []),
  ];
};
