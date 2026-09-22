/**
 * What the command palette can take you to (E3).
 *
 * The site is an index of fifteen seasons, so the corpus is: every manager,
 * every season and each of its tabs, every played week, every head-to-head
 * pairing, every player in the base dictionary, and the top-level pages —
 * plus the one action that is not a destination, the random matchup (E5).
 *
 * The player half of that is ~4,400 rows, which is why this module is only
 * ever imported by the lazily-loaded dialog, and why it builds the index on
 * first use rather than at import time.
 */

import { getPlayers, managers, seasons } from "@/data";
import { CURRENT_YEAR, YEARS } from "@/domain/constants";
import { getCompletedWeek } from "@/utils/weekUtils";
import { fuzzyScore, normalize, tokenize } from "./fuzzy";

export type CommandKind =
  | "action"
  | "page"
  | "manager"
  | "season"
  | "week"
  | "h2h"
  | "player";

export interface CommandItem {
  id: string;
  kind: CommandKind;
  title: string;
  subtitle?: string;
  /** Where Enter goes. Absent only for `action` items. */
  to?: string;
  /** The non-navigating commands. Only one so far. */
  action?: "random-matchup";
}

/** An item with its normalized haystacks, built once and reused per keystroke. */
interface IndexedItem {
  item: CommandItem;
  title: string;
  subtitle: string;
  /** Words that should match but are not shown — "week 8", "qb", "chiefs". */
  keywords: string;
  /** Per-kind nudge, so a manager outranks a player on an equal match. */
  boost: number;
}

export interface CommandResult {
  item: CommandItem;
  score: number;
}

/**
 * Field weights. A hit in the title is what people mean; a hit in the subtitle
 * or the hidden keywords still counts, but should not outrank one.
 */
const TITLE_WEIGHT = 20;
const SUBTITLE_WEIGHT = 6;

/**
 * Kind weights. Small next to the field weights on purpose: they break ties
 * between comparable matches, they do not let a weak manager match beat an
 * exact player one.
 */
const KIND_BOOST: Record<CommandKind, number> = {
  action: 6,
  page: 6,
  manager: 8,
  season: 6,
  h2h: 4,
  week: 2,
  player: 0,
};

/**
 * How many of each kind may reach the list. Without this a query like "2019"
 * fills every row with weeks, and a query like "a" fills them all with
 * players — the point of the palette is that one query shows you a manager, a
 * season and a player at once.
 */
const KIND_LIMIT: Record<CommandKind, number> = {
  action: 2,
  page: 3,
  manager: 5,
  season: 4,
  h2h: 3,
  week: 3,
  player: 8,
};

/** Rows in the list. Enough to be worth arrowing through, few enough to scan. */
export const RESULT_LIMIT = 18;

/**
 * Players are only searched from two characters up. One character matches
 * essentially the whole dictionary, and the answer is never useful.
 */
const MIN_PLAYER_QUERY = 2;

const index = (
  item: CommandItem,
  keywords = ""
): IndexedItem => ({
  item,
  title: normalize(item.title),
  subtitle: normalize(item.subtitle ?? ""),
  keywords: normalize(keywords),
  boost: KIND_BOOST[item.kind],
});

/* ------------------------------------------------------------------ *
 * The corpus
 * ------------------------------------------------------------------ */

const buildActions = (): IndexedItem[] => [
  index(
    {
      id: "action:random-matchup",
      kind: "action",
      title: "Random matchup",
      subtitle: "Drop into a game from anywhere in league history",
      action: "random-matchup",
    },
    "dice shuffle surprise me lucky"
  ),
];

const PAGES: { title: string; to: string; subtitle: string; words: string }[] = [
  { title: "Records", to: "/records", subtitle: "Every list the league keeps, and who tops it", words: "records best worst most ever" },
  { title: "All-time stats", to: "/", subtitle: "All-time standings and top scores", words: "home all time standings breakdown" },
  { title: "Seasons", to: "/seasons", subtitle: "Every season, week by week", words: "history year draft matchups" },
  { title: "Players", to: "/players", subtitle: "Search the player archive", words: "nfl search" },
  { title: "Managers", to: "/managers", subtitle: "The league's owners", words: "owners teams careers" },
  { title: "Head to head", to: "/h2h", subtitle: "Every rivalry in the league", words: "h2h matrix rivalry versus vs" },
  { title: "Hall of Fame", to: "/hof", subtitle: "Inductees and the Ring of Shame", words: "hof shame" },
  { title: "Explorer", to: "/explorer", subtitle: "Dig through the stat registry", words: "stats records query" },
  { title: "Wiki", to: "/wiki", subtitle: "Rules, settings and league lore", words: "rules settings" },
  { title: "Careers", to: "/careers", subtitle: "The all-time power ribbon", words: "power ribbon bump chart" },
  { title: "Luck", to: "/luck", subtitle: "Actual wins against expected wins", words: "lucky unlucky expected" },
  { title: "Top scores", to: "/top-scores", subtitle: "The biggest weeks ever", words: "highest points scores" },
  { title: "Breakdown", to: "/breakdown", subtitle: "All-time week-by-week breakdown", words: "weekly" },
  { title: "Trades", to: "/trades", subtitle: "Every trade in league history", words: "transactions deals" },
  { title: "Schedule comparison", to: "/schedule-comparison/league", subtitle: "What everyone else's schedule would have done", words: "swap schedules" },
];

const buildPages = (): IndexedItem[] =>
  PAGES.map(({ title, to, subtitle, words }) =>
    index({ id: `page:${to}`, kind: "page", title, subtitle, to }, words)
  );

const buildManagers = (): IndexedItem[] =>
  managers.map((manager) =>
    index(
      {
        id: `manager:${manager.id}`,
        kind: "manager",
        title: manager.name,
        subtitle: manager.teamName,
        to: `/managers/${manager.id}`,
      },
      `${manager.teamName} ${manager.sleeper?.display_name ?? ""}`
    )
  );

const SEASON_TABS: { tab: string; label: string; words: string }[] = [
  { tab: "standings", label: "Season", words: "standings table final" },
  { tab: "matchups", label: "Matchups", words: "games scores results" },
  { tab: "draft", label: "Draft", words: "draft board picks" },
  { tab: "playoffs", label: "Playoffs", words: "bracket championship final" },
];

const buildSeasons = (): IndexedItem[] =>
  YEARS.flatMap((year) =>
    SEASON_TABS.map(({ tab, label, words }) =>
      index(
        {
          id: `season:${year}:${tab}`,
          kind: "season",
          title: `${year} ${label}`,
          subtitle: year === CURRENT_YEAR ? "Current season" : undefined,
          to: `/seasons/${year}/${tab}`,
        },
        `${year} ${words}`
      )
    )
  );

/** The last week worth linking to for a season: all of them, bar a live one. */
const lastWeekOf = (year: number): number => {
  const completed = getCompletedWeek(seasons[year]?.league);
  // `null` means a finished season with no `leg` field — every week is done.
  return completed === null ? 17 : completed;
};

const buildWeeks = (): IndexedItem[] =>
  YEARS.flatMap((year) => {
    const items: IndexedItem[] = [];
    for (let week = 1; week <= lastWeekOf(year); week++) {
      items.push(
        index(
          {
            id: `week:${year}:${week}`,
            kind: "week",
            title: `${year} Week ${week}`,
            subtitle: "Every game that week",
            to: `/seasons/${year}/matchups?week=${week}`,
          },
          `w${week} wk${week}`
        )
      );
    }
    return items;
  });

const buildH2H = (): IndexedItem[] => {
  const items: IndexedItem[] = [];
  for (let a = 0; a < managers.length; a++) {
    for (let b = a + 1; b < managers.length; b++) {
      const one = managers[a];
      const two = managers[b];
      items.push(
        index(
          {
            id: `h2h:${one.id}:${two.id}`,
            kind: "h2h",
            title: `${one.name} vs ${two.name}`,
            subtitle: "Head to head record",
            to: `/h2h/${one.id}/${two.id}`,
          },
          `${one.teamName} ${two.teamName} rivalry`
        )
      );
    }
  }
  return items;
};

const buildPlayers = (): IndexedItem[] =>
  Object.entries(getPlayers()).map(([playerId, player]) => {
    const name =
      player.full_name ||
      `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() ||
      playerId;
    const position = player.position || "UNK";

    return index(
      {
        id: `player:${playerId}`,
        kind: "player",
        title: name,
        // No season context here, so this is the player's most recent team —
        // the same rule the players page follows (A1b).
        subtitle: player.team ? `${position} · ${player.team}` : position,
        to: `/players/${playerId}`,
      },
      `${position} ${player.team ?? "free agent"}`
    );
  });

/**
 * Built once, on the first search. Everything but the players is a few hundred
 * rows; the dictionary is the reason this is not done at import time.
 */
let corpus: { light: IndexedItem[]; players: IndexedItem[] } | null = null;

const getCorpus = () => {
  if (!corpus) {
    corpus = {
      light: [
        ...buildActions(),
        ...buildPages(),
        ...buildManagers(),
        ...buildSeasons(),
        ...buildWeeks(),
        ...buildH2H(),
      ],
      players: buildPlayers(),
    };
  }
  return corpus;
};

/** Test seam: forget the built index so a suite can rebuild it. */
export const resetCommandIndex = () => {
  corpus = null;
};

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/**
 * Score one item against one token: the best of its three haystacks, each
 * carrying its field weight. `null` if the token matches none of them.
 */
const scoreToken = (token: string, entry: IndexedItem): number | null => {
  const title = fuzzyScore(token, entry.title);
  const subtitle = fuzzyScore(token, entry.subtitle);
  const keywords = fuzzyScore(token, entry.keywords);

  let best: number | null = null;
  if (title !== null) best = title + TITLE_WEIGHT;
  if (subtitle !== null) {
    const score = subtitle + SUBTITLE_WEIGHT;
    if (best === null || score > best) best = score;
  }
  if (keywords !== null && (best === null || keywords > best)) best = keywords;

  return best;
};

/**
 * Every token has to match something, so "jay 2019" narrows rather than
 * widening. Their order is free: "week 8 2019" and "2019 week 8" are the same
 * query, which is how people actually type.
 */
export const scoreItem = (
  tokens: string[],
  entry: IndexedItem
): number | null => {
  let total = entry.boost;
  for (const token of tokens) {
    const score = scoreToken(token, entry);
    if (score === null) return null;
    total += score;
  }
  return total;
};

/** What the palette shows before anything is typed. */
const defaultResults = (): CommandResult[] =>
  getCorpus()
    .light.filter(
      (entry) =>
        entry.item.kind === "action" ||
        entry.item.kind === "page" ||
        entry.item.id === `season:${CURRENT_YEAR}:standings`
    )
    .slice(0, RESULT_LIMIT)
    .map((entry) => ({ item: entry.item, score: 0 }));

/**
 * Rank the corpus against `query`. Empty query gives the default list.
 *
 * Per-kind caps are applied before the merge so that one prolific kind cannot
 * crowd the others out, then the survivors are re-sorted together — the list
 * is ordered by score, not grouped by kind, because with a caret moving down
 * it one order is easier to follow than seven.
 */
export const searchCommands = (query: string): CommandResult[] => {
  const tokens = tokenize(query);
  if (tokens.length === 0) return defaultResults();

  const { light, players: playerEntries } = getCorpus();
  const pools =
    query.trim().length >= MIN_PLAYER_QUERY ? [light, playerEntries] : [light];

  const byKind = new Map<CommandKind, CommandResult[]>();

  for (const pool of pools) {
    for (const entry of pool) {
      const score = scoreItem(tokens, entry);
      if (score === null) continue;

      const bucket = byKind.get(entry.item.kind);
      if (bucket) bucket.push({ item: entry.item, score });
      else byKind.set(entry.item.kind, [{ item: entry.item, score }]);
    }
  }

  const results: CommandResult[] = [];
  for (const [kind, bucket] of byKind) {
    bucket.sort((a, b) => b.score - a.score);
    results.push(...bucket.slice(0, KIND_LIMIT[kind]));
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_LIMIT);
};
