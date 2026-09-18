/**
 * "Week N in the Chumbo" (J2).
 *
 * The Tuesday-morning card: one picture that says how the week went, so the
 * message to the group is one paste. It is the only card about a whole week
 * rather than one person or one game, which decides most of the layout.
 *
 * **A list, not a hero number.** Every other card is built around one big
 * figure. A week has no single figure worth that — the top score is one fact
 * among five — so the card is a short table: a label column the eye runs down
 * and a sentence beside each. Four rows is the most that stays legible at
 * WhatsApp's thumbnail width; the caller picks which four (`recapLines`,
 * which also writes the page and the link preview, so the three agree).
 *
 * **No accent.** A week belongs to nobody, and colouring it with the top
 * scorer's hue would make it that manager's card. Neutral ink, per the F2 rule
 * that an accent always belongs to exactly one manager.
 */

import { CARD_PADDING, type ShareCard } from "../card";
import { text } from "../svg";
import { fitFontSize, truncateToWidth } from "../text";
import { CARD_TOKENS } from "../tokens";
import {
  type CardChrome,
  CONTENT_WIDTH,
  NEUTRAL_ACCENT,
  eyebrow,
  footer,
  noteLine,
  seasonMeta,
  topRule,
} from "./chrome";

export interface WeekRecapRow {
  /** "Top score" — drawn small and uppercase in the left column. */
  label: string;
  /** "jay 162.4, and still lost to sol" */
  text: string;
}

export interface WeekRecapCardProps extends CardChrome {
  year: number;
  week: number;
  /** A playoff week says so, because its games are not all of equal weight. */
  playoffs?: boolean;
  /** The first four are drawn. */
  rows: readonly WeekRecapRow[];
}

/** Rows drawn; more than this and the thumbnail turns to grey lines. */
export const WEEK_RECAP_ROWS = 4;

const LABEL_WIDTH = 300;
const VALUE_X = CARD_PADDING + LABEL_WIDTH + 24;
const VALUE_WIDTH = CARD_PADDING + CONTENT_WIDTH - VALUE_X;
const FIRST_ROW = 262;
const ROW_STEP = 64;

export const weekRecapCard = ({
  year,
  week,
  playoffs = false,
  rows,
  accent = NEUTRAL_ACCENT,
  crest,
  note,
}: WeekRecapCardProps): ShareCard => {
  const headline = `Week ${week} in the Chumbo`;
  const headlineSize = fitFontSize(headline, CONTENT_WIDTH, 64, {
    weight: 800,
    min: 40,
  });
  const drawn = rows.slice(0, WEEK_RECAP_ROWS);

  return {
    title: `${headline} · ${year}${
      drawn.length ? ` — ${drawn.map((row) => row.text).join("; ")}` : ""
    }`,
    content: [
      topRule(accent),
      eyebrow(playoffs ? `${year} · Playoffs` : `${year} season`, { y: 96 }),
      text(truncateToWidth(headline, CONTENT_WIDTH, headlineSize, { weight: 800 }), {
        x: CARD_PADDING,
        y: 172,
        size: headlineSize,
        weight: 800,
        fill: CARD_TOKENS.ink,
      }),
      ...drawn.map((row, index) => {
        const y = FIRST_ROW + index * ROW_STEP;
        const size = fitFontSize(row.text, VALUE_WIDTH, 36, {
          weight: 700,
          min: 28,
        });
        return [
          eyebrow(row.label, {
            y,
            width: LABEL_WIDTH,
            size: 26,
            fill: CARD_TOKENS.inkFaint,
          }),
          text(truncateToWidth(row.text, VALUE_WIDTH, size, { weight: 700 }), {
            x: VALUE_X,
            y,
            size,
            weight: 700,
            fill: index === 0 ? CARD_TOKENS.ink : CARD_TOKENS.inkMuted,
          }),
        ].join("");
      }),
      note ? noteLine(note, { y: 516, size: 28 }) : "",
      footer({ meta: seasonMeta(year, week), crest }),
    ].join(""),
  };
};
