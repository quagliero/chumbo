/**
 * The five card templates (G2).
 *
 * A template is a pure function from a fact to a `ShareCard`. It does no
 * fetching, no computing and no deciding what is notable — the caller has
 * already done that, because the caller is a page that has the data and the
 * template has to run in Node for G6 as well as in the browser.
 *
 * ## Which card for which fact
 *
 * | Template | Shared from | The fact |
 * | --- | --- | --- |
 * | `finalScoreCard` | a matchup | one game, two scores |
 * | `managerSeasonCard` | a manager page | one manager, one season |
 * | `h2hRecordCard` | the H2H matrix | two managers, all time |
 * | `draftPickCard` | the draft board | one pick |
 * | `recordBrokenCard` | a record, the stats explorer | a league best |
 *
 * ## What a caller assembles
 *
 * The props are deliberately flat primitives — names, numbers, strings — so
 * the templates carry no dependency on `managers.json`, the stat registry or
 * the season loader. Assembling them is four lines at the call site:
 *
 * ```ts
 * const [crest, home, away] = await embedImages([
 *   "/images/logo.png",
 *   getUserAvatarUrl(homeUser),
 *   getUserAvatarUrl(awayUser),
 * ]);
 * const card = finalScoreCard({
 *   year, week,
 *   teams: [
 *     { name: getTeamName(homeUser.user_id, users), score: 147.62, avatar: home },
 *     { name: getTeamName(awayUser.user_id, users), score: 96.08, avatar: away },
 *   ],
 *   accent: getManagerAccent(winnerManagerId),
 *   crest,
 *   note: narrate(stats, { year, week, managerIds })[0],
 * });
 * ```
 *
 * Two things every call site owes the reader:
 *
 *   - **One accent, and it belongs to somebody.** Pass the accent of the
 *     manager the card is about — the winner, the leader, the drafter. Never
 *     two. See the F2 note in `src/domain/managerColors.ts`.
 *   - **Pass the note through, caveat and all.** `narrate()` marks a fact that
 *     rests on 2019's reconstructed per-player data, every template renders
 *     that marking, and dropping it is how a card claims more than the site
 *     does.
 */

export {
  CAVEAT_LONG,
  CAVEAT_SHORT,
  CONTENT_BOTTOM,
  CONTENT_WIDTH,
  FOOTER_HEIGHT,
  NEUTRAL_ACCENT,
  SITE_NAME,
  SITE_URL,
  formatPoints,
  formatRecord,
  formatScore,
  seasonMeta,
  type CardChrome,
  type CardNote,
  type CardPerson,
} from "./chrome";

export {
  FINAL_SCORE_NAME_BOX,
  finalScoreCard,
  type FinalScoreCardProps,
  type FinalScoreSide,
} from "./finalScore";

export {
  managerSeasonCard,
  type ManagerSeasonCardProps,
} from "./managerSeason";

export {
  h2hRecordCard,
  type H2HRecordCardProps,
} from "./h2hRecord";

export {
  draftPickCard,
  formatPickLabel,
  type DraftPickCardProps,
} from "./draftPick";

export {
  recordBrokenCard,
  type RecordBrokenCardProps,
} from "./recordBroken";
