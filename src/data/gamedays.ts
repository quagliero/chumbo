/**
 * Box scores (L1): one file per season per week, written by
 * `yarn build-gamedays` from the NFL's play-by-play, loaded only by the pages
 * that show a week's players.
 *
 * Deliberately not a part of `seasons` (`./parts.ts`). A season's box scores
 * are 200 kB raw, only a matchup page reads them, and it reads one week — so
 * each week is its own small chunk (`gameday-<year>-<week>`, ~2 kB gzipped),
 * fetched when that page opens and never by anything else.
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

export interface GamedayFile {
  v: number;
  /** By Sleeper player id (a team code for a D/ST). Absent means no stats. */
  players: Record<string, GamedayLine>;
}

const files = import.meta.glob<GamedayFile>("./*/gamedays/*.json", {
  import: "default",
});

const pathFor = (year: number, week: number) => `./${year}/gamedays/${week}.json`;

const loaded = new Map<string, GamedayFile | null>();
const inFlight = new Map<string, Promise<GamedayFile | null>>();

/** Whether a week has box scores at all — without loading them. */
export const hasGameday = (year: number, week: number): boolean =>
  pathFor(year, week) in files;

/** A week's box scores if they have loaded, `null` if there are none. */
export const getGameday = (
  year: number,
  week: number
): GamedayFile | null | undefined => {
  const path = pathFor(year, week);
  if (!(path in files)) return null;
  return loaded.get(path);
};

/** Load a week's box scores. Resolves `null` for a week that has none. */
export const loadGameday = (
  year: number,
  week: number
): Promise<GamedayFile | null> => {
  const path = pathFor(year, week);
  const importer = files[path];
  if (!importer) return Promise.resolve(null);
  if (loaded.has(path)) return Promise.resolve(loaded.get(path) ?? null);
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
