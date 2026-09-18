/**
 * A week of the NFL, as the Chumbo's players lived it: one file per season
 * per week, `src/data/<year>/weeks/<week>.json`, written by
 * `yarn build-gamedays` from the NFL's play-by-play and loaded only by the
 * pages that show a week's players.
 *
 * It holds two things the matchup page always wants together:
 *
 *   - `players`: every rostered player's box score and NFL team (L1)
 *   - `t0`/`teams`: every starter's scoring moments, for the chart of how the
 *     week unfolded (L2)
 *
 * Deliberately not a part of `seasons` (`./parts.ts`): only a matchup page
 * reads it, and it reads one week — so each week is its own small chunk
 * (`week-<year>-<week>`, ~10 kB gzipped). One file rather than two halves the
 * lookup table Vite builds for them, which is code every page downloads.
 *
 * No imports from the loader on purpose: nothing here needs the season data,
 * and nothing that uses the season data should pay for this.
 */

/** A player's week: his NFL team, and his counting stats. */
export interface GamedayLine {
  /** NFL team that week, as Sleeper spells it ("LAR", not "LA"). */
  t: string;
  /**
   * The stats he recorded, only the ones that are not zero:
   * pAtt pCmp pYd pTd int · rAtt rYd rTd · tgt rec reYd reTd · fl 2pt stTd ·
   * fgAtt fgm fgLong xpAtt xpm · and for a D/ST: sk int fr ff td sf blk tfl pa.
   */
  s: Record<string, number>;
}

/** A key play's details (L2). */
export interface KeyPlayDetail {
  /** What scored: "rec yds, rec TD". */
  w: string;
  /** The play, as the NFL wrote it. */
  d: string;
  /** "LV @ KC". */
  g: string;
  /** Quarter ("1"–"5"), or "final" for points allowed at the final whistle. */
  q: string;
  /** Game clock, "7:33". */
  c: string;
}

/**
 * [seconds from t0, starter index (-1 for a team correction), points × 100,
 * 1 = correction | a key play's details].
 */
export type TimelineEvent =
  | [number, number, number]
  | [number, number, number, 1 | KeyPlayDetail];

export interface TeamTimeline {
  /** Starter ids, in lineup order; events refer to them by index. */
  s: string[];
  e: TimelineEvent[];
}

export interface WeekFile {
  v: number;
  /** By Sleeper player id (a team code for a D/ST). Absent means no stats. */
  players: Record<string, GamedayLine>;
  /** Epoch seconds of the week's first scoring moment. */
  t0: number;
  /** Timelines by roster id. */
  teams: Record<string, TeamTimeline>;
}

/** The box-score half, for code that reads only that. */
export type GamedayFile = Pick<WeekFile, "players">;
/** The timeline half. */
export type TimelineFile = Pick<WeekFile, "t0" | "teams">;

const files = import.meta.glob<WeekFile>("./*/weeks/*.json", {
  import: "default",
});

const pathFor = (year: number, week: number) => `./${year}/weeks/${week}.json`;

const loaded = new Map<string, WeekFile>();
const inFlight = new Map<string, Promise<WeekFile | null>>();

/** Whether a week has a file at all — without loading it. */
export const hasWeek = (year: number, week: number): boolean =>
  pathFor(year, week) in files;

/** A week's file if it has loaded, `null` if there is none. */
export const getWeek = (year: number, week: number): WeekFile | null | undefined => {
  const path = pathFor(year, week);
  if (!(path in files)) return null;
  return loaded.get(path);
};

/** Load a week's file. Resolves `null` for a week that has none. */
export const loadWeek = (year: number, week: number): Promise<WeekFile | null> => {
  const path = pathFor(year, week);
  const importer = files[path];
  if (!importer) return Promise.resolve(null);
  const ready = loaded.get(path);
  if (ready) return Promise.resolve(ready);
  let pending = inFlight.get(path);
  if (!pending) {
    pending = importer()
      .then((file) => {
        loaded.set(path, file);
        return file;
      })
      .finally(() => inFlight.delete(path));
    inFlight.set(path, pending);
  }
  return pending;
};
