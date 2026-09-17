/**
 * A manager in `src/data/managers.json` — the canonical identity map, and the
 * one file in `src/data` that is not from Sleeper.
 *
 * This type used to declare seven of the ten fields the file actually holds,
 * and `@/data` casts the import, so the three it missed were invisible: three
 * separate pieces of work had to widen it locally before they could read them.
 * Everything in the file is declared here now, including the parts nothing
 * reads — a field that exists and is ignored is worth knowing about.
 */
export interface Manager {
  /** The handle the league uses for each other: `thd`, `hadkiss`. Stable. */
  id: string;
  name: string;
  /**
   * The canonical team name. Per-season names live in that season's
   * `users.json` and can differ — see the note in `utils/teamName.ts`.
   */
  teamName: string;
  /** NFL.com-era user ids. NOT the Sleeper id; that is `sleeper.id`. */
  userId: string[];
  /**
   * The team's number. A bare string for a manager who kept one slot, or keyed
   * by season for one who moved, with `current` for the ongoing arrangement.
   *
   * The values are inconsistently typed in the data — mostly strings, but
   * `phil`'s two seasons and `ryan`'s `current` are numbers. Compare with
   * `String(...)`, not `===`.
   */
  teamId: string | Record<string, string | number>;
  sleeper: {
    id: string;
    display_name: string;
  };

  /* ---- declared, and currently read by nothing ------------------------- */

  /**
   * Present, and `false`, on the five managers who have left.
   *
   * **Nothing reads it, and it is already stale**: `brock` is marked inactive
   * but appears in `src/data/2026/users.json`. Do not start filtering on it
   * without checking it against the current season's rosters first — the
   * Managers page deliberately derives "who plays now" from the data instead.
   */
  active?: boolean;

  /**
   * Mid-season handovers: the weeks of a season this manager actually ran the
   * team. `sol` and `phil` split 2015 and 2016; `chris` covered one week of
   * 2020 for `sol`.
   *
   * **Nothing reads it.** Every page attributes a whole season to the roster's
   * `owner_id`, so those four part-seasons are currently credited entirely to
   * one of the two managers. That is a real inaccuracy in the archive rather
   * than a bug in any one page, and fixing it is a site-wide attribution
   * change — flagged during D7 and still open.
   */
  weeks?: Record<string, number[]>;

  /**
   * A hand-entered scoring-crown count, on `dix` alone.
   *
   * **Nothing reads it**, and `utils/managerStats` computes the real figure
   * from the season data. Kept because deleting a number somebody typed on
   * purpose, without knowing why, is the wrong way round.
   */
  scoringCrowns?: number;
}
