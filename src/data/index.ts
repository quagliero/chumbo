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
import managersJson from "./managers.json";
import { SEASON_FILE_PARTS } from "./parts";
import { recordFailure, throwIfLoadFailed } from "./loadFailure";

export {
  DataLoadFailedError,
  clearLoadFailure,
  throwIfLoadFailed,
} from "./loadFailure";

/* ------------------------------------------------------------------ *
 * A2: nothing here is eager any more, bar managers.json.
 *
 * Every other file under src/data is behind a dynamic import, in one of five
 * kinds of chunk that `vite.config.ts` groups them into:
 *
 *   core-<year>     league, rosters, users, both brackets, schedule
 *   draft-<year>    draft, picks
 *   matchups-<year> the per-week matchup files (A2a)
 *   transactions-<year>  the per-week transaction files (A2a)
 *   players         the base dictionary plus every season's overlay
 *
 * — one load unit ("part") each; `./parts.ts` is the single list of which file
 * is in which.
 *
 * Per season, so a page about 2014 fetches 2014. Content-hashed, so a repeat
 * visit is served from the HTTP cache (see public/_headers) — and so a weekly
 * `fetch-latest` during the live season changes the 2026 chunks' names and
 * leaves 2012-2025 exactly where every returning visitor's cache already has
 * them. That last point is why this is a glob and not the `public/data/` +
 * `fetch()` the plan first sketched: files under public/ are not hashed, so
 * they could only be cached for as long as it is safe to serve last week's
 * 2026 standings, which during a season is not long at all.
 *
 * The files stay where the fetch scripts write them. `yarn fetch-latest`
 * needs no extra step, and the Node consumers (vitest, build-aggregates,
 * prerender-og) read them through this same module.
 *
 * managers.json stays eager: it is 1 kB gzipped and twenty modules import it
 * directly.
 * ------------------------------------------------------------------ */

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

/**
 * One season, as a synchronous view over data that arrives on demand.
 *
 * Every field but `transactions` is a getter that THROWS if its part of the
 * season has not loaded yet — see `DataNotLoadedError`. It never answers with
 * an empty array, because an empty array renders a plausible, wrong page (a
 * standings table with no teams, a champion with no previous titles), and
 * nothing would ever report it.
 */
type SeasonData = {
  /** Part "draft". */
  draft: ExtendedDraft;
  /** Part "draft". */
  picks: ExtendedPick[];
  /** Part "core". */
  league: ExtendedLeague;
  /** Part "core". */
  rosters: ExtendedRoster[];
  /** Part "core". */
  users: ExtendedUser[];
  /** Part "core". */
  winners_bracket: WinnersBracket;
  /** Part "core". */
  losers_bracket: LosersBracket;
  /** Part "matchups" (A2a). Read it through `useSeasonData` / `useAllSeasons`. */
  matchups: Matchups;
  /**
   * Loaded on demand (A2a) and — alone here — NOT guarded: empty until
   * `loadTransactions([year])` resolves. The history page reads it on every
   * tab but only needs it on two, and a guard would make the other six fetch
   * the biggest file in the season. Read it through `useSeasonTransactions`.
   */
  transactions?: Transactions;
  /**
   * This season's corrections to the base player dictionary — team and position
   * as at this season, for the few hundred players they differed for. Absent for
   * seasons with no recorded differences, which then resolve straight to base.
   * Part "players", because it is only ever read alongside the dictionary.
   */
  playerOverlay?: PlayerOverlay;
  /** Part "core". In-progress seasons only. */
  schedule?: Record<string, ScheduledMatchup[]>;
};

/** The last week the loader maps; the fetch scripts pull up to 18. */
const LAST_WEEK = 17;

const asWeekKey = (raw: string): WeekKeys | null => {
  const week = parseInt(raw, 10);
  return week >= 1 && week <= LAST_WEEK ? (raw as WeekKeys) : null;
};

export const managers = managersJson as Manager[];

/* ------------------------------------------------------------------ *
 * The guard.
 * ------------------------------------------------------------------ */

/**
 * Thrown by any read of data that has not loaded yet.
 *
 * It is an Error, so outside React — a script, an event handler, a test that
 * forgot to await — it fails with a message naming what was read too early
 * and a stack pointing at the reader. It is ALSO a thenable that settles when
 * the data arrives, and React treats a thrown thenable as "suspend": so a
 * component that reads unloaded data during render shows the nearest
 * `<Suspense>` fallback and renders again once it is there, exactly as the
 * A2a hooks do on purpose. A reader nobody put behind a hook is therefore
 * slow, never wrong.
 */
export class DataNotLoadedError extends Error {
  readonly promise: Promise<void>;

  constructor(what: string, promise: Promise<void>) {
    super(
      `${what} was read before it loaded. Await loadSeasons() / loadPlayers() ` +
        `first, or read it during render behind one of the hooks in ` +
        `src/hooks/useSeasonData.ts.`
    );
    this.name = "DataNotLoadedError";
    this.promise = promise;
  }

  // This is what makes it suspend. See the class comment.
  then<A = void, B = never>(
    onFulfilled?: ((value: void) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): Promise<A | B> {
    return this.promise.then(onFulfilled, onRejected);
  }
}

/* ------------------------------------------------------------------ *
 * Loading, one part of one season at a time.
 * ------------------------------------------------------------------ */

type JsonModule<T> = { default: T };
type Loader<T> = () => Promise<JsonModule<T>>;

/** The per-year parts `seasons` is split into. Transactions are separate. */
export type SeasonPart = "core" | "draft" | "matchups";

/**
 * Every file of a season that is not a week file, and the part it is in —
 * which is also the chunk `vite.config.ts` puts it in. See `./parts.ts`.
 */
const BASE_FIELDS = {
  league: SEASON_FILE_PARTS.league,
  rosters: SEASON_FILE_PARTS.rosters,
  users: SEASON_FILE_PARTS.users,
  winners_bracket: SEASON_FILE_PARTS.winners_bracket,
  losers_bracket: SEASON_FILE_PARTS.losers_bracket,
  schedule: SEASON_FILE_PARTS.schedule,
  draft: SEASON_FILE_PARTS.draft,
  picks: SEASON_FILE_PARTS.picks,
} as const satisfies Partial<Record<keyof SeasonData, SeasonPart>>;

type BaseField = keyof typeof BASE_FIELDS;

/**
 * What a season's field reads as when its file does not exist — a season
 * still in progress has no brackets and most seasons no schedule. Assigned
 * once when the part loads rather than built on every read, so that a
 * `useMemo` keyed on `season.winners_bracket` sees the same array each time.
 */
const MISSING: { [K in BaseField]: () => SeasonData[K] } = {
  league: () => ({}) as ExtendedLeague,
  rosters: () => [],
  users: () => [],
  winners_bracket: () => [] as WinnersBracket,
  losers_bracket: () => [] as LosersBracket,
  schedule: () => undefined,
  draft: () => ({}) as ExtendedDraft,
  picks: () => [],
};

/**
 * The raw values behind each season's getters. The loaders write here, never
 * through `seasons`, whose getters would refuse to answer mid-load.
 */
type SeasonValues = Partial<Omit<SeasonData, "transactions">> & {
  matchups: Matchups;
};

const values = new Map<number, SeasonValues>(
  YEARS.map((year) => [year, { matchups: {} }])
);

/** One season's worth of one part: the files to load and where to put them. */
type FileTask = () => Promise<void>;

/**
 * Years resolved, loads in flight so that two components asking for 2014 at
 * once issue one fetch, the files each year is made of, and what to do once
 * they are all in.
 */
type PartCache = {
  done: Set<number>;
  inFlight: Map<number, Promise<void>>;
  files: Map<number, FileTask[]>;
  finish?: (year: number) => void;
};

const newPart = (finish?: (year: number) => void): PartCache => ({
  done: new Set(),
  inFlight: new Map(),
  files: new Map(),
  finish,
});

const addFile = (part: PartCache, year: number, task: FileTask) => {
  const existing = part.files.get(year);
  if (existing) existing.push(task);
  else part.files.set(year, [task]);
};

/** `./2014/rosters.json` → `[2014, "rosters"]`, for this season's files only. */
const parsePath = (path: string, pattern: RegExp): [number, string] | null => {
  const match = path.match(pattern);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  return values.has(year) ? [year, match[2]] : null;
};

/**
 * Bumped every time a part of a season finishes loading.
 *
 * `seasons` is a synchronous view that fills in over time, so anything that
 * derives a value from it and caches the result has to know when the
 * underlying data changed. See `src/utils/cache.ts`.
 */
let dataVersion = 0;

/** The current data version. Include it in any key that caches derived stats. */
export const getDataVersion = (): number => dataVersion;

const loadPartYear = (part: PartCache, year: number): Promise<void> => {
  if (part.done.has(year)) return Promise.resolve();

  const inFlight = part.inFlight.get(year);
  if (inFlight) return inFlight;

  const complete = () => {
    part.finish?.(year);
    part.done.add(year);
    dataVersion += 1;
  };

  const files = part.files.get(year);
  if (!files?.length) {
    complete();
    return Promise.resolve();
  }

  const promise = Promise.all(files.map((task) => task()))
    .then(complete)
    .catch(recordFailure)
    .finally(() => {
      part.inFlight.delete(year);
    });

  part.inFlight.set(year, promise);
  return promise;
};

const loadPart = (part: PartCache, years: readonly number[]): Promise<void> =>
  years.every((year) => part.done.has(year))
    ? Promise.resolve()
    : Promise.all(years.map((year) => loadPartYear(part, year))).then(
        () => undefined
      );

/* ---------------------------------------------------- core and draft */

/**
 * Give every field whose file a season lacks its stand-in, once the rest of
 * its part is in: a live season has no brackets, and only a live season has
 * a schedule.
 */
const fillMissing = (part: SeasonPart) => (year: number) => {
  // A year that is not a season — `/seasons/1999/standings` — has nothing to
  // fill in, and `seasons[1999]` stays undefined, as it always was.
  const season = values.get(year) as Record<string, unknown> | undefined;
  if (!season) return;
  for (const [field, owner] of Object.entries(BASE_FIELDS)) {
    if (owner === part && !(field in season)) {
      season[field] = MISSING[field as BaseField]();
    }
  }
};

const corePart = newPart(fillMissing("core"));
const draftPart = newPart(fillMissing("draft"));

const baseFiles = import.meta.glob([
  "./*/league.json",
  "./*/rosters.json",
  "./*/users.json",
  "./*/winners_bracket.json",
  "./*/losers_bracket.json",
  "./*/schedule.json",
  "./*/draft.json",
  "./*/picks.json",
]) as Record<string, Loader<unknown>>;

for (const [path, load] of Object.entries(baseFiles)) {
  const parsed = parsePath(path, /^\.\/(\d{4})\/(\w+)\.json$/);
  if (!parsed) continue;
  const [year, name] = parsed;
  const field = name as BaseField;
  const part = BASE_FIELDS[field] === "core" ? corePart : draftPart;

  addFile(part, year, async () => {
    const data = (await load()).default;
    (values.get(year) as Record<string, unknown>)[field] = data;
  });
}

/* -------------------------------------------- matchups, transactions */

const matchupPart = newPart();
const transactionPart = newPart();

const matchupFiles = import.meta.glob("./*/matchups/*.json") as Record<
  string,
  Loader<ExtendedMatchup[]>
>;

for (const [path, load] of Object.entries(matchupFiles)) {
  const parsed = parsePath(path, /^\.\/(\d{4})\/matchups\/(\d+)\.json$/);
  if (!parsed) continue;
  const [year, rawWeek] = parsed;
  const week = asWeekKey(rawWeek);
  if (!week) continue;

  addFile(matchupPart, year, async () => {
    values.get(year)!.matchups[week] = (await load()).default;
  });
}

const transactionFiles = import.meta.glob([
  "./*/transactions/*.json",
  "./*/transactions.json",
]) as Record<string, Loader<Transaction[]>>;

for (const [path, load] of Object.entries(transactionFiles)) {
  // Group 2 is the week, absent for the legacy whole-season transactions.json.
  const match = path.match(/^\.\/(\d{4})\/transactions(?:\/(\d+))?\.json$/);
  if (!match) continue;
  const year = parseInt(match[1], 10);
  if (!values.has(year)) continue;
  const week = match[2] === undefined ? null : asWeekKey(match[2]);
  if (match[2] !== undefined && week === null) continue;

  addFile(transactionPart, year, async () => {
    assignTransactions(year, week, (await load()).default);
  });
}

/* ------------------------------------------------------------ players */

let dictionary: Record<string, Player> | null = null;
const overlays = new Map<number, PlayerOverlay>();
let playersInFlight: Promise<void> | null = null;

const overlayFiles = import.meta.glob("./*/players.delta.json") as Record<
  string,
  Loader<PlayerOverlay>
>;

/* ------------------------------------------------------------ seasons */

const PARTS: Record<SeasonPart, PartCache> = {
  core: corePart,
  draft: draftPart,
  matchups: matchupPart,
};

const ALL_PARTS: readonly SeasonPart[] = ["core", "draft", "matchups"];

/**
 * Refuse to read `part` of `year` before it has loaded.
 *
 * The load this starts is for EVERY season, not just `year`. The pages ask
 * for what they need up front through the hooks, so a read that gets here is
 * almost always one of the sweeps — `Object.entries(seasons).map(...)` in a
 * component that was only thought of as being about one season. Loading one
 * year per miss would turn that sweep into fifteen round trips, one after the
 * other; loading them together makes it one.
 */
const guard = (year: number, part: SeasonPart, field: string) => {
  if (PARTS[part].done.has(year)) return;
  throwIfLoadFailed();
  throw new DataNotLoadedError(
    `seasons[${year}].${field}`,
    loadSeasonParts(YEARS, [part])
  );
};

const buildSeason = (year: number): SeasonData => {
  const backing = values.get(year)!;
  const season = { transactions: {} } as SeasonData;

  const guarded = (field: keyof SeasonValues, check: () => void) =>
    Object.defineProperty(season, field, {
      enumerable: true,
      get() {
        check();
        return backing[field];
      },
      // The tests swap a season's matchups out and back; nothing else writes.
      set(value) {
        (backing as Record<string, unknown>)[field] = value;
      },
    });

  for (const [field, part] of Object.entries(BASE_FIELDS)) {
    guarded(field as BaseField, () => guard(year, part, field));
  }
  guarded("matchups", () => guard(year, "matchups", "matchups"));
  guarded("playerOverlay", () => {
    if (!dictionary) {
      throwIfLoadFailed();
      throw new DataNotLoadedError(
        `seasons[${year}].playerOverlay`,
        loadPlayers()
      );
    }
  });

  return season;
};

/**
 * The resolved view of the league. Every season's key is present from the
 * start; its contents answer once loaded and throw `DataNotLoadedError` until
 * then. Indexed by plain `number`, not ValidYear, so the call sites that index
 * with an unvalidated number keep compiling.
 */
export const seasons: Record<number, SeasonData> = Object.fromEntries(
  YEARS.map((year) => [year, buildSeason(year)])
);

const assignTransactions = (
  year: number,
  week: WeekKeys | null,
  data: Transaction[]
) => {
  const transactions = (seasons[year].transactions ??= {});

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

/* ------------------------------------------------------------ the API */

/** Have `parts` of every one of `years` loaded? */
export const areSeasonPartsLoaded = (
  years: readonly number[],
  parts: readonly SeasonPart[]
): boolean =>
  parts.every((part) => years.every((year) => PARTS[part].done.has(year)));

/**
 * Load `parts` of `years`. Deduplicated and cached, so calling it on every
 * render is cheap once the data is in. For a page that needs less than a
 * whole season — the all-time standings read `core` and nothing else.
 */
export const loadSeasonParts = (
  years: readonly number[],
  parts: readonly SeasonPart[]
): Promise<void> =>
  areSeasonPartsLoaded(years, parts)
    ? Promise.resolve()
    : Promise.all(parts.map((part) => loadPart(PARTS[part], years))).then(
        () => undefined
      );

/** Has everything but the transactions loaded for every one of `years`? */
export const areSeasonsLoaded = (years: readonly number[]): boolean =>
  areSeasonPartsLoaded(years, ALL_PARTS);

/**
 * Load everything in `years` but the transactions: the core files, the draft
 * and the matchups. The matchups are ~20 kB a season gzipped against the draft's
 * ~3 kB, so a page that wants one without the other can ask for exactly that
 * through `loadSeasonParts`; most want both.
 */
export const loadSeasons = (years: readonly number[]): Promise<void> =>
  loadSeasonParts(years, ALL_PARTS);

/** Have every one of `years` had its transactions loaded? */
export const areTransactionsLoaded = (years: readonly number[]): boolean =>
  years.every((year) => transactionPart.done.has(year));

/** Load the transactions for `years` into `seasons`. See `loadSeasons`. */
export const loadTransactions = (years: readonly number[]): Promise<void> =>
  loadPart(transactionPart, years);

/** Has the player dictionary (with every season's overlay) loaded? */
export const arePlayersLoaded = (): boolean => dictionary !== null;

/**
 * Load the player dictionary: 105 kB gzipped, and the one thing here that is
 * not per season. The overlays ride along — 2 kB between them, and only ever
 * read through `getPlayer`, which needs the dictionary anyway.
 */
export const loadPlayers = (): Promise<void> => {
  if (dictionary) return Promise.resolve();
  if (playersInFlight) return playersInFlight;

  playersInFlight = Promise.all([
    import("./players.json") as Promise<JsonModule<Record<string, Player>>>,
    ...Object.entries(overlayFiles).map(async ([path, load]) => {
      const parsed = parsePath(path, /^\.\/(\d{4})\/(players)\.delta\.json$/);
      if (parsed) overlays.set(parsed[0], (await load()).default);
    }),
  ])
    .then(([base]) => {
      for (const [year, overlay] of overlays) {
        (values.get(year) as SeasonValues).playerOverlay = overlay;
      }
      dictionary = base.default;
      dataVersion += 1;
    })
    .catch(recordFailure)
    .finally(() => {
      playersInFlight = null;
    });

  return playersInFlight;
};

/**
 * Everything, for the test suite's global setup and the build scripts —
 * which await this so that every synchronous `seasons[...]` read keeps working
 * unchanged.
 */
export const loadAllSeasons = (): Promise<void> =>
  Promise.all([
    loadSeasons(YEARS),
    loadTransactions(YEARS),
    loadPlayers(),
  ]).then(() => undefined);

/**
 * The base player dictionary: every player we have ever seen, newest
 * attributes. Throws `DataNotLoadedError` until `loadPlayers()` has resolved.
 * Prefer `getPlayer`, which applies the season's overlay.
 */
export const getPlayers = (): Record<string, Player> => {
  if (!dictionary) {
    throwIfLoadFailed();
    throw new DataNotLoadedError("The player dictionary", loadPlayers());
  }
  return dictionary;
};

/**
 * Look a player up in the base dictionary, then apply that season's overlay.
 *
 * Without `year` you get the player's most recent team and position, which is the
 * right answer where there is no season context (player search) and the wrong one
 * everywhere else — pass the year whenever you have it.
 *
 * Throws `DataNotLoadedError` until `loadPlayers()` has resolved — never
 * `undefined` for a player who is merely not downloaded yet, because callers
 * read `undefined` as "not a real player" and render his id instead.
 */
export const getPlayer = (
  playerId: string | number,
  year?: number
): Player | undefined => {
  const playerIdStr = playerId.toString();
  const player = getPlayers()[playerIdStr];

  if (player) {
    const overlay = year
      ? overlays.get(year as ValidYear)?.[playerIdStr]
      : undefined;

    if (!overlay) return player;

    // Spread rather than mutate: the dictionary is a shared module-level object.
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
