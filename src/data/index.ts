import { ValidYear, YEARS } from "@/domain/constants";
import { LosersBracket, WinnersBracket } from "@/types/bracket";
import { ExtendedDraft } from "@/types/draft";
import { ExtendedLeague } from "@/types/league";
import { Manager } from "@/types/manager";
import { ExtendedMatchup, ScheduledMatchup } from "@/types/matchup";
import { ExtendedPick } from "@/types/pick";
import { Player, PlayerOverlay } from "@/types/player";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedUser } from "@/types/user";
import { Transaction } from "@/types/transaction";

type WeekKeys =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17";

type Matchups = {
  [key in WeekKeys]?: ExtendedMatchup[];
};

type Transactions = {
  [key in WeekKeys]?: Transaction[];
};

type SeasonData = {
  draft: ExtendedDraft;
  picks: ExtendedPick[];
  league: ExtendedLeague;
  rosters: ExtendedRoster[];
  users: ExtendedUser[];
  winners_bracket: WinnersBracket;
  losers_bracket: LosersBracket;
  /**
   * Loaded on demand (A2a). Empty until `loadSeasons([year])` — or
   * `loadAllSeasons()` — has resolved for this season; read it through
   * `useSeasonData` / `useAllSeasons`, which suspend until it is populated.
   */
  matchups: Matchups;
  /** Loaded on demand (A2a). See `matchups`, plus `useSeasonTransactions`. */
  transactions?: Transactions;
  /**
   * This season's corrections to the base player dictionary — team and position
   * as at this season, for the few hundred players they differed for. Absent for
   * seasons with no recorded differences, which then resolve straight to base.
   */
  playerOverlay?: PlayerOverlay;
  schedule?: Record<string, ScheduledMatchup[]>; // In-progress seasons only
};

/** The last week the loader maps; the fetch scripts pull up to 18. */
const LAST_WEEK = 17;

const asWeekKey = (raw: string): WeekKeys | null => {
  const week = parseInt(raw, 10);
  return week >= 1 && week <= LAST_WEEK ? (raw as WeekKeys) : null;
};

/* ------------------------------------------------------------------ *
 * Eager: everything small.
 *
 * `league`, `rosters`, `users`, `draft`, `picks`, the brackets, the
 * schedule and the player overlays come to ~1.7 MB raw across fifteen
 * seasons and are read by nearly every page, so they stay in the main
 * bundle. The per-week matchup and transaction files — 8.3 MB raw, and
 * the whole reason the data chunk was 933 kB gzipped — are loaded on
 * demand below.
 * ------------------------------------------------------------------ */

type JsonModule<T> = { default: T };

const eagerFiles = import.meta.glob(
  [
    "./**/*.json",
    "!./*/matchups/*.json",
    "!./*/transactions/*.json",
    "!./*/transactions.json",
  ],
  { eager: true }
) as Record<string, JsonModule<unknown>>;

/** Read one eagerly-globbed file, or `undefined` if that season lacks it. */
const eager = <T>(path: string): T | undefined =>
  (eagerFiles[path] as JsonModule<T> | undefined)?.default;

/** Read one eagerly-globbed file, falling back for seasons that lack it. */
const eagerOr = <T>(path: string, fallback: T): T =>
  eager<T>(path) ?? fallback;

export const managers = eagerOr<Manager[]>("./managers.json", []);

/** The base dictionary: every player we have ever seen, newest attributes. */
export const players = eagerOr<Record<string, Player>>("./players.json", {});

const buildSeasons = (): Record<number, SeasonData> => {
  const built: Partial<Record<ValidYear, SeasonData>> = {};

  for (const year of YEARS) {
    built[year] = {
      draft: eagerOr<ExtendedDraft>(`./${year}/draft.json`, {} as ExtendedDraft),
      picks: eagerOr<ExtendedPick[]>(`./${year}/picks.json`, []),
      league: eagerOr<ExtendedLeague>(
        `./${year}/league.json`,
        {} as ExtendedLeague
      ),
      rosters: eagerOr<ExtendedRoster[]>(`./${year}/rosters.json`, []),
      users: eagerOr<ExtendedUser[]>(`./${year}/users.json`, []),
      winners_bracket: eagerOr<WinnersBracket>(
        `./${year}/winners_bracket.json`,
        [] as WinnersBracket
      ),
      losers_bracket: eagerOr<LosersBracket>(
        `./${year}/losers_bracket.json`,
        [] as LosersBracket
      ),
      matchups: {},
      transactions: {},
      playerOverlay: eager<PlayerOverlay>(`./${year}/players.delta.json`),
      schedule: eager<Record<string, ScheduledMatchup[]>>(
        `./${year}/schedule.json`
      ),
    };
  }

  // Indexed by plain `number`, not ValidYear, so the ~15 existing call sites
  // that index with an unvalidated number keep compiling.
  return built as Record<number, SeasonData>;
};

/**
 * The resolved view of the league. Present synchronously, but `matchups` and
 * `transactions` fill in as seasons are loaded — see `loadSeasons` below.
 */
export const seasons = buildSeasons();

/* ------------------------------------------------------------------ *
 * Lazy: the per-week files.
 *
 * `import.meta.glob` without `eager` gives one dynamic import per file;
 * `vite.config.ts` groups them into a chunk per season per kind, so a
 * page that wants 2014 fetches 2014 and nothing else.
 * ------------------------------------------------------------------ */

type Loader<T> = () => Promise<JsonModule<T>>;

/** A week file, or (for 2012-2019 transactions) a whole season in one file. */
type WeekLoader<T> = { week: WeekKeys | null; load: Loader<T> };

const groupByYear = <T>(
  files: Record<string, Loader<T>>,
  pattern: RegExp
): Map<number, WeekLoader<T>[]> => {
  const byYear = new Map<number, WeekLoader<T>[]>();

  for (const [path, load] of Object.entries(files)) {
    const match = path.match(pattern);
    if (!match) continue;

    const year = parseInt(match[1], 10);
    if (!seasons[year]) continue;

    // match[2] is absent for the legacy whole-season transactions.json.
    const week = match[2] === undefined ? null : asWeekKey(match[2]);
    if (match[2] !== undefined && week === null) continue;

    const existing = byYear.get(year);
    if (existing) existing.push({ week, load });
    else byYear.set(year, [{ week, load }]);
  }

  return byYear;
};

const matchupLoaders = groupByYear(
  import.meta.glob("./*/matchups/*.json") as Record<
    string,
    Loader<ExtendedMatchup[]>
  >,
  /^\.\/(\d{4})\/matchups\/(\d+)\.json$/
);

const transactionLoaders = groupByYear(
  import.meta.glob([
    "./*/transactions/*.json",
    "./*/transactions.json",
  ]) as Record<string, Loader<Transaction[]>>,
  /^\.\/(\d{4})\/transactions(?:\/(\d+))?\.json$/
);

/**
 * One cache per kind: the years already resolved, and the loads still in
 * flight so that two components asking for 2014 at once issue one fetch.
 */
type LoadCache = { done: Set<number>; inFlight: Map<number, Promise<void>> };

const newCache = (): LoadCache => ({ done: new Set(), inFlight: new Map() });

const matchupCache = newCache();
const transactionCache = newCache();

/**
 * Bumped every time a season finishes loading.
 *
 * `seasons` is a synchronous view that fills in over time (A2a), so anything
 * that derives a value from it and caches the result has to know when the
 * underlying data changed. Without this, a stat computed while only 2014 was
 * loaded would be cached forever as if it were the whole league.
 *
 * See `src/utils/cache.ts`.
 */
let dataVersion = 0;

/** The current data version. Include it in any key that caches derived stats. */
export const getDataVersion = (): number => dataVersion;

const loadYear = <T>(
  cache: LoadCache,
  loaders: Map<number, WeekLoader<T>[]>,
  year: number,
  assign: (season: SeasonData, week: WeekKeys | null, data: T) => void
): Promise<void> => {
  if (cache.done.has(year)) return Promise.resolve();

  const inFlight = cache.inFlight.get(year);
  if (inFlight) return inFlight;

  const season = seasons[year];
  const files = loaders.get(year);
  if (!season || !files?.length) {
    cache.done.add(year);
    dataVersion += 1;
    return Promise.resolve();
  }

  const promise = Promise.all(
    files.map(async ({ week, load }) => {
      assign(season, week, (await load()).default);
    })
  )
    .then(() => {
      cache.done.add(year);
      dataVersion += 1;
    })
    .finally(() => {
      cache.inFlight.delete(year);
    });

  cache.inFlight.set(year, promise);
  return promise;
};

const assignMatchups = (
  season: SeasonData,
  week: WeekKeys | null,
  data: ExtendedMatchup[]
) => {
  if (week) season.matchups[week] = data;
};

const assignTransactions = (
  season: SeasonData,
  week: WeekKeys | null,
  data: Transaction[]
) => {
  const transactions = (season.transactions ??= {});

  if (week) {
    transactions[week] = data;
    return;
  }

  // 2012-2019 kept one transactions.json for the whole season, grouped by
  // `leg` rather than split into per-week files.
  for (const transaction of data) {
    const key = transaction.leg?.toString();
    const weekKey = key === undefined ? null : asWeekKey(key);
    if (!weekKey) continue;
    (transactions[weekKey] ??= []).push(transaction);
  }
};

/** Have every one of `years` had its matchups loaded? */
export const areSeasonsLoaded = (years: readonly number[]): boolean =>
  years.every((year) => matchupCache.done.has(year));

/** Have every one of `years` had its transactions loaded? */
export const areTransactionsLoaded = (years: readonly number[]): boolean =>
  years.every((year) => transactionCache.done.has(year));

/**
 * Load the matchups for `years` into `seasons`. Deduplicated and cached, so
 * calling it on every render is cheap once the data is in.
 */
export const loadSeasons = (years: readonly number[]): Promise<void> =>
  areSeasonsLoaded(years)
    ? Promise.resolve()
    : Promise.all(
        years.map((year) =>
          loadYear(matchupCache, matchupLoaders, year, assignMatchups)
        )
      ).then(() => undefined);

/** Load the transactions for `years` into `seasons`. See `loadSeasons`. */
export const loadTransactions = (years: readonly number[]): Promise<void> =>
  areTransactionsLoaded(years)
    ? Promise.resolve()
    : Promise.all(
        years.map((year) =>
          loadYear(
            transactionCache,
            transactionLoaders,
            year,
            assignTransactions
          )
        )
      ).then(() => undefined);

/**
 * Everything, for the all-time pages and the test suite's global setup —
 * which awaits this so that every existing synchronous `seasons[...]` read
 * keeps working unchanged.
 */
export const loadAllSeasons = (): Promise<void> =>
  Promise.all([loadSeasons(YEARS), loadTransactions(YEARS)]).then(
    () => undefined
  );

/**
 * Look a player up in the base dictionary, then apply that season's overlay.
 *
 * Without `year` you get the player's most recent team and position, which is the
 * right answer where there is no season context (player search) and the wrong one
 * everywhere else — pass the year whenever you have it.
 */
export const getPlayer = (
  playerId: string | number,
  year?: number
): Player | undefined => {
  const playerIdStr = playerId.toString();
  const player = players[playerIdStr];

  if (player) {
    const overlay = year
      ? seasons[year as ValidYear]?.playerOverlay?.[playerIdStr]
      : undefined;

    if (!overlay) return player;

    // Spread rather than mutate: `players` is a shared module-level object.
    return {
      ...player,
      ...("t" in overlay ? { team: overlay.t } : {}),
      ...("p" in overlay ? { position: overlay.p } : {}),
    };
  }

  // Older seasons store some players as a bare name string ("Danario Alexander",
  // "Mikel Leshoure") rather than a Sleeper id. Synthesise a record so callers get
  // a name; position has to come from context (see getPlayerPosition).
  if (typeof playerId === "string" && playerId.includes(" ")) {
    const [firstName, ...rest] = playerId.split(" ");

    return {
      player_id: playerId,
      first_name: firstName,
      last_name: rest.join(" "),
      full_name: playerId,
      position: "UNK",
      team: null,
      fantasy_positions: ["UNK"],
    };
  }

  return undefined;
};
