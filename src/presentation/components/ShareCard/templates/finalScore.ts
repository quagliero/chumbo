/**
 * The final score (G2).
 *
 * The card the league will make most: one game, two teams, two numbers. It is
 * the thing people already screenshot badly, so the bar is that it reads
 * faster than a screenshot of the matchup page does.
 *
 * ## Layout decisions
 *
 * **The winner goes on top**, whatever order the caller passes. At thumbnail
 * size nobody reads two names and compares two numbers — they read the top
 * line. Putting the winner there means the card answers "who won" with
 * position as well as with colour, which matters because the reader may be
 * colour-blind, and because WhatsApp's own compression is unkind to the green.
 * A tie keeps the given order and both sides go grey, which is the honest
 * rendering of a game nobody won.
 *
 * **Two rows, not a table.** A scoreboard wants a column of names and a column
 * of numbers, which at 200px wide is four grey smudges. Two rows of 68px
 * digits, right-aligned against the margin, is two things to look at.
 *
 * **One accent: the winner's.** It rings the winning avatar and draws the top
 * rule. Colouring both managers is exactly what the F2 note forbids, and the
 * ring is the use it explicitly sanctions.
 */

import { CARD_PADDING, CARD_WIDTH, type ShareCard } from "../card";
import { group, text } from "../svg";
import { fitFontSize, truncateToWidth } from "../text";
import { CARD_TOKENS } from "../tokens";
import {
  type CardChrome,
  type CardPerson,
  NEUTRAL_ACCENT,
  avatar,
  divider,
  eyebrow,
  footer,
  formatScore,
  noteLine,
  seasonMeta,
  topRule,
} from "./chrome";

export interface FinalScoreSide extends CardPerson {
  /** Points scored. Rendered to one decimal; not rounded to an integer. */
  score: number;
}

export interface FinalScoreCardProps extends CardChrome {
  year: number;
  week: number;
  /**
   * What kind of game it was — "Championship", "Semi-final", "Consolation".
   * Replaces the "FINAL" eyebrow, because "FINAL · Championship" is two words
   * for one idea and the card has room for neither.
   */
  stage?: string;
  /** The two teams, in any order. The winner is moved to the top row. */
  teams: readonly [FinalScoreSide, FinalScoreSide];
}

/** Room for "147.6" at 68px, with the margin the estimate wants. */
const SCORE_WIDTH = 210;
const NAME_X = CARD_PADDING + 128;
const NAME_WIDTH = CARD_WIDTH - CARD_PADDING - SCORE_WIDTH - 24 - NAME_X;

export const finalScoreCard = ({
  year,
  week,
  stage,
  teams,
  accent = NEUTRAL_ACCENT,
  crest,
  note,
}: FinalScoreCardProps): ShareCard => {
  const [first, second] = [...teams].sort((a, b) => b.score - a.score);
  const tied = first.score === second.score;

  const row = (side: FinalScoreSide, y: number, won: boolean, id: string) => {
    const size = fitFontSize(side.name, NAME_WIDTH, 62, {
      weight: 700,
      min: 32,
    });
    return group({}, [
      avatar({
        id,
        person: side,
        cx: CARD_PADDING + 48,
        cy: y,
        r: 48,
        // Only the winner is ringed: one accent per card, and the ring is the
        // thing that says which of the two the colour belongs to.
        ring: won && !tied ? accent : undefined,
      }),
      text(truncateToWidth(side.name, NAME_WIDTH, size, { weight: 700 }), {
        x: NAME_X,
        y,
        size,
        weight: 700,
        fill: won && !tied ? CARD_TOKENS.ink : CARD_TOKENS.inkMuted,
        baseline: "central",
      }),
      text(formatScore(side.score), {
        x: CARD_WIDTH - CARD_PADDING,
        y,
        size: 68,
        weight: 800,
        fill: tied
          ? CARD_TOKENS.tie
          : won
            ? CARD_TOKENS.win
            : CARD_TOKENS.inkMuted,
        anchor: "end",
        baseline: "central",
        numeric: true,
      }),
    ]);
  };

  return {
    title: `${first.name} ${formatScore(first.score)} – ${
      second.name
    } ${formatScore(second.score)} · ${seasonMeta(year, week)}`,
    content: [
      topRule(accent),
      eyebrow(tied ? "Final · tied" : (stage ?? "Final"), { y: 116 }),
      row(first, 232, true, "first"),
      divider(316),
      row(second, 400, false, "second"),
      note ? noteLine(note, { y: 506 }) : "",
      footer({ meta: seasonMeta(year, week), crest }),
    ].join(""),
  };
};

/**
 * The box a team name is fitted into.
 *
 * Exported because the test asserts on it: a name that overflows its box is
 * invisible until somebody has already shared the card, so the fit is checked
 * against the same number the layout uses rather than against a copy of it.
 */
export const FINAL_SCORE_NAME_BOX = { x: NAME_X, width: NAME_WIDTH } as const;
